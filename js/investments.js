// ============================================================
// js/investments.js – Investments CRUD, Buy Lots, Sells, Realized/Unrealized P&L
// ============================================================
import {
  saveInvestment, getInvestments, deleteInvestment,
  addBuyLot, getBuyLots, deleteBuyLot,
  addSellTrade, getSellTrades, deleteSellTrade
} from "./database.js?v=20260705b";
import { formatCurrency, formatDate, todayISO, toast, openModal, closeModal, pct } from "./utils.js?v=20260705b";
import { renderInvCharts } from "./charts.js?v=20260705b";

export const ASSET_TYPES = ["Equity", "Mutual Fund", "Commodity", "FD"];

let _investments = [];                 // open + partially-sold holdings
let _allSells    = {};                 // { investmentId: [sell, ...] }
let _allBuys     = {};                 // { investmentId: [buy, ...] }

export const initInvestments = async () => {
  _investments = await getInvestments();

  // One-time migration: old "Gold" asset type → "Commodity"
  const goldOnes = _investments.filter(i => i.assetType === "Gold");
  for (const inv of goldOnes) {
    await saveInvestment(inv.id, { assetType: "Commodity" });
    inv.assetType = "Commodity";
  }

  await reloadSubcollections();
  renderInvestmentsPage();
};

const reloadSubcollections = async () => {
  const results = await Promise.all(
    _investments.map(async inv => ({
      id: inv.id,
      sells: await getSellTrades(inv.id),
      buys: await getBuyLots(inv.id)
    }))
  );
  _allSells = {}; _allBuys = {};
  results.forEach(r => { _allSells[r.id] = r.sells; _allBuys[r.id] = r.buys; });
};

export const getInvestmentsData = () => _investments;
export const getAllSells = () => _allSells;
export const getAllBuys  = () => _allBuys;

// ─── P&L HELPERS ──────────────────────────────────────────────
const realizedForHolding = (inv) => {
  const sells = _allSells[inv.id] || [];
  return sells.reduce((s, sell) => s + (sell.sellPrice - inv.avgPrice) * sell.quantity, 0);
};

// Remaining open quantity after all sells
const openQty = (inv) => {
  const sells = _allSells[inv.id] || [];
  const soldQty = sells.reduce((s, sell) => s + sell.quantity, 0);
  return Math.max(0, (inv.quantity || 0) - soldQty);
};

const unrealizedForHolding = (inv) => {
  const qty = openQty(inv);
  return ((inv.currentPrice || inv.avgPrice) - inv.avgPrice) * qty;
};

// ─── PAGE AGGREGATES ──────────────────────────────────────────
// "Total Invested" reflects only what's still actually invested (open
// quantity) — money already returned via a sale is no longer "invested".
export const aggregateInvestments = (invs) => {
  let totalInvested = 0, currentValue = 0, realized = 0, unrealized = 0;
  for (const inv of invs) {
    const oQty = openQty(inv);
    totalInvested += (inv.avgPrice * oQty) || 0;
    currentValue  += (inv.currentPrice || inv.avgPrice) * oQty;
    realized      += realizedForHolding(inv);
    unrealized    += unrealizedForHolding(inv);
  }
  return { totalInvested, currentValue, realized, unrealized };
};

// ─── RENDER PAGE ──────────────────────────────────────────────
export const renderInvestmentsPage = () => {
  const agg = aggregateInvestments(_investments);

  document.getElementById("inv-total-invested").textContent = formatCurrency(agg.totalInvested, "INR", true);
  document.getElementById("inv-total-value").textContent    = formatCurrency(agg.currentValue,  "INR", true);

  const realEl = document.getElementById("inv-realized");
  realEl.textContent = (agg.realized >= 0 ? "+" : "") + formatCurrency(agg.realized, "INR", true);
  realEl.className = "card-value " + (agg.realized >= 0 ? "positive" : "negative");

  const unrEl = document.getElementById("inv-unrealized");
  unrEl.textContent = (agg.unrealized >= 0 ? "+" : "") + formatCurrency(agg.unrealized, "INR", true);
  unrEl.className = "card-value " + (agg.unrealized >= 0 ? "positive" : "negative");

  renderInvCharts(_investments, _allSells);
  recordAssetClassSnapshot();

  const activeTab = document.querySelector("#inv-tabs .tab.active")?.dataset.tab || "equity";
  renderInvTable(activeTab);

  document.querySelectorAll("#inv-tabs .tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll("#inv-tabs .tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderInvTable(tab.dataset.tab);
    };
  });
};

// ─── DAILY SNAPSHOT BY ASSET CLASS (for the trading-style value chart) ──
const SNAPSHOT_TYPE_KEY = "portfolio_snapshots_by_type";
const recordAssetClassSnapshot = () => {
  const byType = { Equity: 0, "Mutual Fund": 0, Commodity: 0, FD: 0 };
  _investments.forEach(inv => {
    const oQty = openQty(inv);
    const val = (inv.currentPrice || inv.avgPrice) * oQty;
    if (byType[inv.assetType] !== undefined) byType[inv.assetType] += val;
  });
  let snaps = {};
  try { snaps = JSON.parse(localStorage.getItem(SNAPSHOT_TYPE_KEY)) || {}; } catch { snaps = {}; }
  snaps[todayISO()] = byType;
  try { localStorage.setItem(SNAPSHOT_TYPE_KEY, JSON.stringify(snaps)); } catch {}
  return snaps;
};

export const getAssetClassSnapshots = () => {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_TYPE_KEY)) || {}; } catch { return {}; }
};

// ─── INVESTMENT TABLE ─────────────────────────────────────────
const TYPE_MAP = {
  "equity":       "Equity",
  "mutual-funds": "Mutual Fund",
  "commodity":    "Commodity",
  "fd":           "FD",
};

const renderInvTable = (tab) => {
  const wantedType = TYPE_MAP[tab];
  const filtered = _investments.filter(inv => (inv.assetType || "") === wantedType);

  const container = document.getElementById("inv-table-container");
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="trending-up"></i><p>No ${tab.replace("-"," ")} holdings. Add one!</p></div>`;
    lucide.createIcons();
    return;
  }

  const rows = filtered.map(inv => {
    const oQty       = openQty(inv);
    const invested   = inv.avgPrice * oQty;
    const curVal     = (inv.currentPrice || inv.avgPrice) * oQty;
    const unreal     = unrealizedForHolding(inv);
    const real       = realizedForHolding(inv);
    const unrCls     = unreal >= 0 ? "positive" : "negative";
    const realCls    = real  >= 0 ? "positive" : "negative";
    const sells      = _allSells[inv.id] || [];
    const soldQty    = sells.reduce((s, sl) => s + sl.quantity, 0);
    const buys       = _allBuys[inv.id] || [];

    return `
      <tr data-id="${inv.id}">
        <td>
          <strong>${inv.name}</strong>
          <div class="muted" style="font-size:0.72rem">${inv.broker||""} · ${inv.sector||""}</div>
        </td>
        <td>
          <span title="Open qty">${oQty}</span>
          ${soldQty > 0 ? `<div class="muted" style="font-size:0.7rem">${soldQty} sold</div>` : ""}
        </td>
        <td>${formatCurrency(inv.avgPrice)}</td>
        <td>${formatCurrency(inv.currentPrice||inv.avgPrice)}</td>
        <td>${formatCurrency(invested)}</td>
        <td>${formatCurrency(curVal)}</td>
        <td class="${unrCls}">${unreal>=0?"+":""}${formatCurrency(unreal)}</td>
        <td class="${realCls}">${real>=0?"+":""}${formatCurrency(real)}</td>
        <td class="inv-actions">
          <button class="btn btn-outline btn-sm inv-buymore" data-id="${inv.id}">Buy More</button>
          ${oQty > 0 ? `<button class="btn btn-outline btn-sm inv-sell" data-id="${inv.id}">Sell</button>` : ""}
          <button class="btn btn-ghost btn-sm inv-history" data-id="${inv.id}">History${(buys.length+sells.length)>0 ? ` (${buys.length+sells.length})` : ""}</button>
          <button class="btn btn-ghost btn-sm inv-edit"  data-id="${inv.id}">Edit</button>
          <button class="btn btn-danger btn-sm inv-del"  data-id="${inv.id}">Del</button>
        </td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="inv-table-wrap">
      <table class="inv-table">
        <thead>
          <tr>
            <th>Name / Broker</th>
            <th>Qty (Open)</th>
            <th>Avg Buy</th>
            <th>Current</th>
            <th>Total Invested</th>
            <th>Current Value</th>
            <th>Unrealized P&amp;L</th>
            <th>Realized P&amp;L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll(".inv-edit").forEach(btn =>
    btn.onclick = () => openInvModal(_investments.find(i => i.id === btn.dataset.id))
  );
  container.querySelectorAll(".inv-sell").forEach(btn =>
    btn.onclick = () => openSellModal(_investments.find(i => i.id === btn.dataset.id))
  );
  container.querySelectorAll(".inv-buymore").forEach(btn =>
    btn.onclick = () => openBuyMoreModal(_investments.find(i => i.id === btn.dataset.id))
  );
  container.querySelectorAll(".inv-history").forEach(btn =>
    btn.onclick = () => openHistoryModal(_investments.find(i => i.id === btn.dataset.id))
  );
  container.querySelectorAll(".inv-del").forEach(btn =>
    btn.onclick = () => confirmDeleteInv(btn.dataset.id)
  );
};

// ─── HISTORY MODAL (every buy lot + every sell, chronologically) ──
const openHistoryModal = (inv) => {
  if (!inv) return;
  const buys  = (_allBuys[inv.id]  || []).map(b => ({ ...b, _kind: "Buy",  _date: b.date,     _qty: b.quantity, _price: b.price }));
  const sells = (_allSells[inv.id] || []).map(s => ({ ...s, _kind: "Sell", _date: s.sellDate, _qty: s.quantity, _price: s.sellPrice }));
  const all = [...buys, ...sells].sort((a, b) => new Date(a._date) - new Date(b._date));

  const rows = all.length === 0
    ? `<tr><td colspan="6" class="muted" style="text-align:center;padding:1rem">No recorded lots yet</td></tr>`
    : all.map(item => {
        const isBuy = item._kind === "Buy";
        const pnl = isBuy ? null : (item._price - inv.avgPrice) * item._qty;
        return `<tr>
          <td>${formatDate(item._date)}</td>
          <td><span class="badge ${isBuy ? "badge-positive" : "badge-negative"}">${item._kind}</span></td>
          <td>${item._qty}</td>
          <td>${formatCurrency(item._price)}</td>
          <td>${pnl===null ? "—" : `<span class="${pnl>=0?"positive":"negative"}">${pnl>=0?"+":""}${formatCurrency(pnl)}</span>`}</td>
          <td><button class="btn btn-danger btn-sm" data-del-${isBuy?"buy":"sell"}="${item.id}">×</button></td>
        </tr>`;
      }).join("");

  const totalBoughtQty = buys.reduce((s, b) => s + (b._qty||0), 0);
  const totalSoldQty   = sells.reduce((s, sl) => s + (sl._qty||0), 0);

  const body = `
    <div class="muted" style="font-size:0.85rem;margin-bottom:var(--sp-md)">
      <strong>${inv.name}</strong> · ${inv.assetType} · Current avg buy: ${formatCurrency(inv.avgPrice)}
      &nbsp;·&nbsp; Bought: <strong>${totalBoughtQty}</strong> &nbsp;·&nbsp; Sold: <strong>${totalSoldQty}</strong>
      &nbsp;·&nbsp; Open: <strong>${openQty(inv)}</strong>
    </div>
    <div class="inv-table-wrap" style="max-height:360px;overflow-y:auto">
      <table class="inv-table">
        <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Price</th><th>Realized P&amp;L</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const footer = `<button class="btn btn-ghost" id="hist-close">Close</button>`;
  openModal(`History — ${inv.name}`, body, footer);
  document.getElementById("hist-close").onclick = closeModal;

  document.querySelectorAll("[data-del-buy]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Delete this buy lot? This recalculates the average buy price.")) return;
      await deleteBuyLot(inv.id, btn.dataset.delBuy);
      await recalcFromBuyLots(inv.id);
      closeModal();
      renderInvestmentsPage();
      window.dispatchEvent(new Event("data:changed"));
    };
  });
  document.querySelectorAll("[data-del-sell]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Delete this sell record?")) return;
      await deleteSellTrade(inv.id, btn.dataset.delSell);
      _allSells[inv.id] = await getSellTrades(inv.id);
      toast("Sell record deleted");
      closeModal();
      renderInvestmentsPage();
      window.dispatchEvent(new Event("data:changed"));
    };
  });
};

// ─── RECOMPUTE avgPrice/quantity FROM BUY LOTS (weighted average) ──
const recalcFromBuyLots = async (investmentId) => {
  const buys = await getBuyLots(investmentId);
  _allBuys[investmentId] = buys;
  const totalQty = buys.reduce((s, b) => s + (b.quantity || 0), 0);
  const totalCost = buys.reduce((s, b) => s + (b.quantity || 0) * (b.price || 0), 0);
  const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
  await saveInvestment(investmentId, { quantity: totalQty, avgPrice });
  const inv = _investments.find(i => i.id === investmentId);
  if (inv) { inv.quantity = totalQty; inv.avgPrice = avgPrice; }
};

// ─── BUY MORE (averages into the existing holding, doesn't create a new row) ──
const openBuyMoreModal = (inv) => {
  if (!inv) return;
  const body = `
    <div class="muted" style="font-size:0.85rem;margin-bottom:var(--sp-md)">
      <strong>${inv.name}</strong> &nbsp;·&nbsp; Current avg buy: ${formatCurrency(inv.avgPrice)} &nbsp;·&nbsp; Open qty: <strong>${openQty(inv)}</strong>
    </div>
    <div class="form-row">
      <label>Additional Quantity</label>
      <input type="number" id="buy-qty" class="input" placeholder="0" step="0.001" />
    </div>
    <div class="form-row">
      <label>Price Paid (per unit)</label>
      <input type="number" id="buy-price" class="input" placeholder="0.00" step="0.01" />
    </div>
    <div class="form-row">
      <label>Purchase Date</label>
      <input type="date" id="buy-date" class="input" value="${todayISO()}" />
    </div>
    <div class="form-row">
      <label>Notes (optional)</label>
      <input type="text" id="buy-notes" class="input" placeholder="e.g. Monthly SIP" />
    </div>
    <div id="buy-avg-preview" style="margin-top:var(--sp-sm)"></div>`;

  const footer = `
    <button class="btn btn-ghost" id="buy-cancel">Cancel</button>
    <button class="btn btn-primary" id="buy-confirm">Add to Holding</button>`;

  openModal(`Buy More — ${inv.name}`, body, footer);

  const updatePreview = () => {
    const qty   = parseFloat(document.getElementById("buy-qty")?.value) || 0;
    const price = parseFloat(document.getElementById("buy-price")?.value) || 0;
    const el    = document.getElementById("buy-avg-preview");
    if (!el) return;
    if (qty <= 0 || price <= 0) { el.innerHTML = ""; return; }
    const oQty = openQty(inv);
    const newTotalQty = oQty + qty; // approximate preview (ignores prior sells' effect on lot count, fine for preview)
    const newAvg = ((inv.avgPrice * oQty) + (price * qty)) / (newTotalQty || 1);
    el.innerHTML = `<div class="tax-highlight">New average buy price ≈ <strong>${formatCurrency(newAvg)}</strong></div>`;
  };
  document.getElementById("buy-qty")?.addEventListener("input", updatePreview);
  document.getElementById("buy-price")?.addEventListener("input", updatePreview);

  document.getElementById("buy-cancel").onclick = closeModal;
  document.getElementById("buy-confirm").onclick = async () => {
    const qty   = parseFloat(document.getElementById("buy-qty").value) || 0;
    const price = parseFloat(document.getElementById("buy-price").value) || 0;
    const date  = document.getElementById("buy-date").value;
    const notes = document.getElementById("buy-notes").value.trim();

    if (qty <= 0)   { toast("Enter a quantity", "error"); return; }
    if (price <= 0) { toast("Enter a valid price", "error"); return; }

    await addBuyLot(inv.id, { quantity: qty, price, date, notes });
    await recalcFromBuyLots(inv.id);

    toast("Purchase added — average buy price updated", "success");
    closeModal();
    renderInvestmentsPage();
    window.dispatchEvent(new Event("data:changed"));
  };
};

// ─── SELL MODAL ───────────────────────────────────────────────
const openSellModal = (inv) => {
  if (!inv) return;
  const available = openQty(inv);
  const sells     = _allSells[inv.id] || [];

  const sellHistoryHTML = sells.length === 0 ? "" : `
    <div class="section-title small" style="margin-top:1rem">Sell History</div>
    <table class="inv-table" style="margin-top:0.5rem">
      <thead><tr><th>Date</th><th>Qty</th><th>Sell Price</th><th>Realized P&L</th><th></th></tr></thead>
      <tbody>
        ${sells.map(sl => {
          const pnl = (sl.sellPrice - inv.avgPrice) * sl.quantity;
          const cls = pnl >= 0 ? "positive" : "negative";
          return `<tr>
            <td>${formatDate(sl.sellDate)}</td>
            <td>${sl.quantity}</td>
            <td>${formatCurrency(sl.sellPrice)}</td>
            <td class="${cls}">${pnl>=0?"+":""}${formatCurrency(pnl)}</td>
            <td><button class="btn btn-danger btn-sm" data-del-sell="${sl.id}">×</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  const body = `
    <div class="muted" style="font-size:0.85rem;margin-bottom:var(--sp-md)">
      <strong>${inv.name}</strong> &nbsp;·&nbsp; Avg buy: ${formatCurrency(inv.avgPrice)} &nbsp;·&nbsp; Available qty: <strong>${available}</strong>
    </div>
    <div class="form-row">
      <label>Quantity to Sell</label>
      <input type="number" id="sell-qty" class="input" placeholder="0" max="${available}" step="0.001" />
    </div>
    <div class="form-row">
      <label>Sell Price (per unit)</label>
      <input type="number" id="sell-price" class="input" placeholder="0.00" step="0.01" />
    </div>
    <div class="form-row">
      <label>Sell Date</label>
      <input type="date" id="sell-date" class="input" value="${todayISO()}" />
    </div>
    <div class="form-row">
      <label>Notes (optional)</label>
      <input type="text" id="sell-notes" class="input" placeholder="e.g. Partial profit booking" />
    </div>
    <div id="sell-pnl-preview" style="margin-top:var(--sp-sm)"></div>
    ${sellHistoryHTML}`;

  const footer = `
    <button class="btn btn-ghost" id="sell-cancel">Cancel</button>
    <button class="btn btn-primary" id="sell-confirm">Record Sale</button>`;

  openModal(`Sell — ${inv.name}`, body, footer);

  const updatePreview = () => {
    const qty   = parseFloat(document.getElementById("sell-qty")?.value) || 0;
    const price = parseFloat(document.getElementById("sell-price")?.value) || 0;
    const el    = document.getElementById("sell-pnl-preview");
    if (!el || qty <= 0 || price <= 0) { if(el) el.innerHTML = ""; return; }
    const pnl = (price - inv.avgPrice) * qty;
    const cls = pnl >= 0 ? "positive" : "negative";
    el.innerHTML = `<div class="tax-highlight">
      Estimated Realized P&L: <strong class="${cls}">${pnl>=0?"+":""}${formatCurrency(pnl)}</strong>
      &nbsp;·&nbsp; Proceeds: ${formatCurrency(price * qty)}
    </div>`;
  };
  document.getElementById("sell-qty")?.addEventListener("input", updatePreview);
  document.getElementById("sell-price")?.addEventListener("input", updatePreview);

  document.querySelectorAll("[data-del-sell]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Delete this sell record?")) return;
      await deleteSellTrade(inv.id, btn.dataset.delSell);
      _allSells[inv.id] = await getSellTrades(inv.id);
      toast("Sell record deleted");
      closeModal();
      renderInvestmentsPage();
      window.dispatchEvent(new Event("data:changed"));
    };
  });

  document.getElementById("sell-cancel").onclick = closeModal;
  document.getElementById("sell-confirm").onclick = async () => {
    const qty      = parseFloat(document.getElementById("sell-qty").value) || 0;
    const price    = parseFloat(document.getElementById("sell-price").value) || 0;
    const sellDate = document.getElementById("sell-date").value;
    const notes    = document.getElementById("sell-notes").value.trim();

    if (qty <= 0) { toast("Enter quantity to sell", "error"); return; }
    if (qty > available) { toast(`Only ${available} units available`, "error"); return; }
    if (price <= 0)  { toast("Enter a valid sell price", "error"); return; }

    await addSellTrade(inv.id, { quantity: qty, sellPrice: price, sellDate, notes });

    if (qty >= available) {
      await saveInvestment(inv.id, { fullyExited: true, exitDate: sellDate });
    }

    toast("Sale recorded", "success");
    closeModal();
    _allSells[inv.id] = await getSellTrades(inv.id);
    renderInvestmentsPage();
    window.dispatchEvent(new Event("data:changed"));
  };
};

// ─── FIND MATCHING HOLDING (for buy-more-as-new-entry averaging) ──
// Same Name + Asset Type + Broker + Sector (case-insensitive) = one holding.
const findMatchingHolding = (data) => {
  const norm = (s) => (s || "").trim().toLowerCase();
  return _investments.find(inv =>
    norm(inv.name) === norm(data.name) &&
    inv.assetType === data.assetType &&
    norm(inv.broker) === norm(data.broker) &&
    norm(inv.sector) === norm(data.sector)
  );
};

// ─── ADD / EDIT MODAL ─────────────────────────────────────────
export const openInvModal = (inv) => {
  const isEdit = !!inv;

  const body = `
    <div class="form-row">
      <label>Asset Type</label>
      <select id="inv-m-type" class="input" ${isEdit ? "disabled" : ""}>
        ${ASSET_TYPES.map(t => `<option value="${t}" ${inv?.assetType===t?"selected":""}>${t}</option>`).join("")}
      </select>
    </div>
    <div class="form-row">
      <label>Name / Symbol</label>
      <input type="text" id="inv-m-name" class="input" placeholder="e.g. RELIANCE, SBI Bluechip" value="${inv?.name||""}" ${isEdit ? "disabled" : ""} />
    </div>
    <div class="form-row">
      <label>ISIN (optional)</label>
      <input type="text" id="inv-m-isin" class="input" placeholder="e.g. INE002A01018" value="${inv?.isin||""}" />
    </div>
    <div class="form-row-inline">
      <div class="form-row">
        <label>${isEdit ? "Quantity (Total Bought)" : "Quantity"}</label>
        <input type="number" id="inv-m-qty" class="input" placeholder="0" value="${inv?.quantity||""}" step="0.001" ${isEdit ? "disabled" : ""} />
      </div>
      <div class="form-row">
        <label>${isEdit ? "Average Buy Price" : "Price Paid (per unit)"}</label>
        <input type="number" id="inv-m-avg" class="input" placeholder="0.00" value="${inv?.avgPrice||""}" step="0.01" ${isEdit ? "disabled" : ""} />
      </div>
    </div>
    ${isEdit ? `<div class="muted" style="font-size:0.72rem;margin:-8px 0 8px">Quantity &amp; Avg Price are derived from Buy History. Use "Buy More" or edit lots in History to change them.</div>` : ""}
    <div class="form-row">
      <label>Current Price</label>
      <input type="number" id="inv-m-current" class="input" placeholder="0.00" value="${inv?.currentPrice||""}" step="0.01" />
    </div>
    <div class="form-row">
      <label>Broker / Platform</label>
      <input type="text" id="inv-m-broker" class="input" placeholder="e.g. Zerodha, Groww" value="${inv?.broker||""}" ${isEdit ? "disabled" : ""} />
    </div>
    <div class="form-row">
      <label>Sector</label>
      <input type="text" id="inv-m-sector" class="input" placeholder="e.g. Technology, Finance" value="${inv?.sector||""}" ${isEdit ? "disabled" : ""} />
    </div>
    <div class="form-row">
      <label>Purchase Date</label>
      <input type="date" id="inv-m-date" class="input" value="${inv?.purchaseDate||todayISO()}" ${isEdit ? "disabled" : ""} />
    </div>
    <div class="form-row">
      <label>Notes</label>
      <input type="text" id="inv-m-notes" class="input" placeholder="Optional" value="${inv?.notes||""}" />
    </div>
    ${!isEdit ? `<div class="muted" style="font-size:0.72rem">If Name + Asset Type + Broker + Sector match an existing holding, this will be added as another purchase (averaged in) instead of a new row.</div>` : ""}`;

  const footer = `
    ${isEdit ? `<button class="btn btn-danger btn-sm" id="inv-m-delete">Delete</button>` : ""}
    <button class="btn btn-ghost" id="inv-m-cancel">Cancel</button>
    <button class="btn btn-primary" id="inv-m-save">${isEdit ? "Update" : "Add"}</button>`;

  openModal(isEdit ? "Edit Investment" : "Add Investment", body, footer);

  document.getElementById("inv-m-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("inv-m-delete").onclick = () => confirmDeleteInv(inv.id);
  document.getElementById("inv-m-save").onclick = () => saveInv(inv?.id);
};

const saveInv = async (editId) => {
  const data = {
    assetType:    document.getElementById("inv-m-type").value,
    name:         document.getElementById("inv-m-name").value.trim(),
    isin:         document.getElementById("inv-m-isin").value.trim(),
    currentPrice: parseFloat(document.getElementById("inv-m-current").value) || 0,
    broker:       document.getElementById("inv-m-broker").value.trim(),
    sector:       document.getElementById("inv-m-sector").value.trim(),
    notes:        document.getElementById("inv-m-notes").value.trim(),
  };
  const qty   = parseFloat(document.getElementById("inv-m-qty").value) || 0;
  const price = parseFloat(document.getElementById("inv-m-avg").value) || 0;
  const date  = document.getElementById("inv-m-date").value;

  try {
    if (editId) {
      // Edit mode: metadata only (quantity/avgPrice are derived, disabled in UI)
      await saveInvestment(editId, data);
      toast("Investment updated", "success");
    } else {
      if (qty <= 0)   { toast("Enter a quantity", "error"); return; }
      if (price <= 0) { toast("Enter a valid price", "error"); return; }

      const match = findMatchingHolding(data);
      if (match) {
        await addBuyLot(match.id, { quantity: qty, price, date, notes: data.notes });
        await recalcFromBuyLots(match.id);
        if (data.currentPrice) await saveInvestment(match.id, { currentPrice: data.currentPrice, isin: data.isin || match.isin });
        toast(`Added to existing ${match.name} holding — averaged in`, "success");
      } else {
        const newId = await saveInvestment(null, { ...data, quantity: qty, avgPrice: price, purchaseDate: date });
        await addBuyLot(newId, { quantity: qty, price, date, notes: data.notes });
      }
    }

    closeModal();
    _investments = await getInvestments();
    const goldOnes = _investments.filter(i => i.assetType === "Gold");
    for (const inv of goldOnes) { await saveInvestment(inv.id, { assetType: "Commodity" }); inv.assetType = "Commodity"; }
    await reloadSubcollections();
    renderInvestmentsPage();
    window.dispatchEvent(new Event("data:changed"));
  } catch (err) {
    toast("Error saving investment", "error");
    console.error(err);
  }
};

const confirmDeleteInv = async (id) => {
  if (!confirm("Delete this investment and all its buy/sell records?")) return;
  await deleteInvestment(id);
  toast("Investment deleted");
  closeModal();
  _investments = await getInvestments();
  delete _allSells[id];
  delete _allBuys[id];
  renderInvestmentsPage();
  window.dispatchEvent(new Event("data:changed"));
};
