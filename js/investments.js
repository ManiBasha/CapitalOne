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
import { computeFIFOMatches, calcEquityCharges, calcMFCharges, calcCommodityCharges, calcGenericCharges } from "./fifo.js?v=20260705b";

export const ASSET_TYPES = ["Equity", "Mutual Fund", "Commodity", "FD"];

const CUSTOM_TYPES_KEY = "custom_asset_types";
const getCustomTypes = () => {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TYPES_KEY)) || []; } catch { return []; }
};
const saveCustomTypes = (types) => {
  try { localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(types)); } catch {}
};
export const getAllAssetTypes = () => [...ASSET_TYPES, ...getCustomTypes()];
const addCustomType = (name) => {
  const types = getCustomTypes();
  if (!types.includes(name)) { types.push(name); saveCustomTypes(types); }
};
const slugify = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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
// ─── FIFO SUMMARY PER HOLDING ───────────────────────────────────
// Single source of truth: FIFO-matches every sell against the oldest buy
// lots first, so realized P&L is net of charges AND each match carries the
// correct holding period (needed for STCG/LTCG). Open quantity/cost basis
// comes from whatever buy lots remain unconsumed.
const fifoSummaryForHolding = (inv) => {
  const buys = _allBuys[inv.id] || [];
  const sells = _allSells[inv.id] || [];
  const { matches, remainingBuyLots } = computeFIFOMatches(buys, sells);
  const openQty = remainingBuyLots.reduce((s, l) => s + l.remaining, 0);
  const openCost = remainingBuyLots.reduce((s, l) => s + l.remaining * l.price, 0);
  const avgOpenPrice = openQty > 0 ? openCost / openQty : (inv.avgPrice || 0);
  const realizedNet = matches.reduce((s, m) => s + m.netGain, 0);
  return { matches, remainingBuyLots, openQty, openCost, avgOpenPrice, realizedNet };
};

export const getFIFOMatchesForInvestment = (inv) => fifoSummaryForHolding(inv).matches;
export const getAllFIFOMatches = () => {
  const all = [];
  _investments.forEach(inv => {
    fifoSummaryForHolding(inv).matches.forEach(m => all.push({ ...m, investment: inv }));
  });
  return all;
};

const realizedForHolding = (inv) => fifoSummaryForHolding(inv).realizedNet;

// Remaining open quantity after all sells (FIFO-consistent)
const openQty = (inv) => fifoSummaryForHolding(inv).openQty;

const unrealizedForHolding = (inv) => {
  const { openQty: qty, avgOpenPrice } = fifoSummaryForHolding(inv);
  return ((inv.currentPrice || inv.avgPrice) - avgOpenPrice) * qty;
};

// ─── PAGE AGGREGATES ──────────────────────────────────────────
// "Total Invested" reflects only what's still actually invested (open
// FIFO lots) — money already returned via a sale is no longer "invested".
export const aggregateInvestments = (invs) => {
  let totalInvested = 0, currentValue = 0, realized = 0, unrealized = 0;
  for (const inv of invs) {
    const fifo = fifoSummaryForHolding(inv);
    totalInvested += fifo.openCost || 0;
    currentValue  += (inv.currentPrice || inv.avgPrice) * fifo.openQty;
    realized      += fifo.realizedNet;
    unrealized    += ((inv.currentPrice || inv.avgPrice) - fifo.avgOpenPrice) * fifo.openQty;
  }
  return { totalInvested, currentValue, realized, unrealized };
};

// ─── RENDER PAGE ──────────────────────────────────────────────
// ─── FINANCIAL YEAR HELPERS (India: 1 Apr – 31 Mar) ────────────
const fyForDate = (dateStr) => {
  const d = new Date(dateStr);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `FY ${y}-${String(y + 1).slice(2)}`;
};
const fyRange = (label) => {
  const y = parseInt(label.replace("FY ", "").split("-")[0]);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
};

let _dateFilter = null; // { from, to } or null (= all time)

// Realized P&L within an optional date range (matched against sell date),
// using FIFO-matched net-of-charges gains.
const realizedInRange = (from, to) => {
  let total = 0;
  _investments.forEach(inv => {
    fifoSummaryForHolding(inv).matches.forEach(m => {
      if (from && m.sellDate < from) return;
      if (to && m.sellDate > to) return;
      total += m.netGain;
    });
  });
  return total;
};

const populateFYOptions = () => {
  const sel = document.getElementById("inv-fy-filter");
  if (!sel) return;
  const allDates = [];
  Object.values(_allSells).forEach(sells => sells.forEach(s => s.sellDate && allDates.push(s.sellDate)));
  Object.values(_allBuys).forEach(buys => buys.forEach(b => b.date && allDates.push(b.date)));
  const fySet = new Set(allDates.map(fyForDate));
  const fyList = [...fySet].sort().reverse();
  const current = sel.value;
  sel.innerHTML = `<option value="all">All Time</option>` + fyList.map(fy => `<option value="${fy}">${fy}</option>`).join("");
  if (fyList.includes(current)) sel.value = current;
};

const bindInvFilters = () => {
  const fySel = document.getElementById("inv-fy-filter");
  const fromEl = document.getElementById("inv-date-from");
  const toEl = document.getElementById("inv-date-to");

  fySel?.addEventListener("change", () => {
    if (fySel.value === "all") { _dateFilter = null; }
    else { _dateFilter = fyRange(fySel.value); }
    if (fromEl) fromEl.value = ""; if (toEl) toEl.value = "";
    applyDateFilter();
  });

  document.getElementById("btn-apply-date-filter")?.addEventListener("click", () => {
    const from = fromEl?.value, to = toEl?.value;
    if (!from && !to) { toast("Pick a from/to date, or use the Financial Year dropdown", "error"); return; }
    _dateFilter = { from: from || null, to: to || null };
    if (fySel) fySel.value = "all";
    applyDateFilter();
  });

  document.getElementById("btn-clear-date-filter")?.addEventListener("click", () => {
    _dateFilter = null;
    if (fromEl) fromEl.value = ""; if (toEl) toEl.value = "";
    if (fySel) fySel.value = "all";
    applyDateFilter();
  });
};

const applyDateFilter = () => {
  const realized = _dateFilter ? realizedInRange(_dateFilter.from, _dateFilter.to) : aggregateInvestments(_investments).realized;
  const realEl = document.getElementById("inv-realized");
  realEl.textContent = (realized >= 0 ? "+" : "") + formatCurrency(realized, "INR", true);
  realEl.className = "card-value " + (realized >= 0 ? "positive" : "negative");
  const noteEl = document.getElementById("inv-realized-note");
  if (noteEl) noteEl.textContent = _dateFilter ? "Filtered period" : "From sold holdings";
};

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

  renderInvTabs();
  populateFYOptions();
  bindInvFilters();
  if (_dateFilter) applyDateFilter();

  const activeTab = document.querySelector("#inv-tabs .tab.active")?.dataset.tab || "equity";
  renderInvTable(activeTab);
};

const renderInvTabs = () => {
  const tabsEl = document.getElementById("inv-tabs");
  if (!tabsEl) return;
  const currentActive = tabsEl.querySelector(".tab.active")?.dataset.tab;
  const allTypes = getAllAssetTypes();

  tabsEl.innerHTML = allTypes.map((t, i) => {
    const slug = slugify(t);
    const isActive = currentActive ? currentActive === slug : i === 0;
    return `<button class="tab ${isActive ? "active" : ""}" data-tab="${slug}">${t}</button>`;
  }).join("");

  tabsEl.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      tabsEl.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderInvTable(tab.dataset.tab);
    };
  });
};

// ─── DAILY SNAPSHOT BY ASSET CLASS (for the trading-style value chart) ──
const SNAPSHOT_TYPE_KEY = "portfolio_snapshots_by_type";
const recordAssetClassSnapshot = () => {
  const byType = {};
  getAllAssetTypes().forEach(t => byType[t] = 0);
  _investments.forEach(inv => {
    const oQty = openQty(inv);
    const val = (inv.currentPrice || inv.avgPrice) * oQty;
    if (byType[inv.assetType] === undefined) byType[inv.assetType] = 0;
    byType[inv.assetType] += val;
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
const buildTypeMap = () => Object.fromEntries(getAllAssetTypes().map(t => [slugify(t), t]));

const renderInvTable = (tab) => {
  const wantedType = buildTypeMap()[tab];
  const filtered = _investments.filter(inv => (inv.assetType || "") === wantedType);

  const container = document.getElementById("inv-table-container");
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="trending-up"></i><p>No ${tab.replace("-"," ")} holdings. Add one!</p></div>`;
    lucide.createIcons();
    return;
  }

  const rows = filtered.map(inv => {
    const fifo       = fifoSummaryForHolding(inv);
    const oQty       = fifo.openQty;
    const invested   = fifo.openCost;
    const curVal     = (inv.currentPrice || inv.avgPrice) * oQty;
    const unreal     = ((inv.currentPrice || inv.avgPrice) - fifo.avgOpenPrice) * oQty;
    const real       = fifo.realizedNet;
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
        <td>${formatCurrency(fifo.avgOpenPrice)}</td>
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
  const fifoMatches = getFIFOMatchesForInvestment(inv);

  const rows = all.length === 0
    ? `<tr><td colspan="7" class="muted" style="text-align:center;padding:1rem">No recorded lots yet</td></tr>`
    : all.map(item => {
        const isBuy = item._kind === "Buy";
        const charges = item.charges?.total || 0;
        let pnl = null, holdingNote = "";
        if (!isBuy) {
          const matchesForSell = fifoMatches.filter(m => m.sellId === item.id);
          pnl = matchesForSell.reduce((s, m) => s + m.netGain, 0);
          const hasLT = matchesForSell.some(m => m.isLongTerm);
          const hasST = matchesForSell.some(m => !m.isLongTerm);
          holdingNote = hasLT && hasST ? "STCG+LTCG" : hasLT ? "LTCG" : hasST ? "STCG" : "";
        }
        return `<tr>
          <td>${formatDate(item._date)}</td>
          <td><span class="badge ${isBuy ? "badge-positive" : "badge-negative"}">${item._kind}</span></td>
          <td>${item._qty}</td>
          <td>${formatCurrency(item._price)}</td>
          <td>${formatCurrency(charges)}</td>
          <td>${pnl===null ? "—" : `<span class="${pnl>=0?"positive":"negative"}">${pnl>=0?"+":""}${formatCurrency(pnl)}</span> ${holdingNote ? `<span class="muted" style="font-size:0.68rem">(${holdingNote})</span>` : ""}`}</td>
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
        <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Price</th><th>Charges</th><th>Realized P&amp;L (FIFO, net)</th><th></th></tr></thead>
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
    <div id="buy-avg-preview" style="margin-top:var(--sp-sm)"></div>
    <div class="section-title small" style="margin-top:1rem">Charges</div>
    <div id="buy-charges-fields">${chargesFieldsHTML(inv.assetType, "buy")}</div>
    <div id="buy-charges-preview"></div>`;

  const footer = `
    <button class="btn btn-ghost" id="buy-cancel">Cancel</button>
    <button class="btn btn-primary" id="buy-confirm">Add to Holding</button>`;

  openModal(`Buy More — ${inv.name}`, body, footer);
  prefillChargeDefaults(inv.assetType, "buy");
  bindChargesLivePreview(inv.assetType, "buy", "buy-qty", "buy-price", "buy-charges-preview");

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
    const charges = readChargesFromFields(inv.assetType, "buy", qty, price);

    if (qty <= 0)   { toast("Enter a quantity", "error"); return; }
    if (price <= 0) { toast("Enter a valid price", "error"); return; }

    await addBuyLot(inv.id, { quantity: qty, price, date, notes, charges });
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
      <thead><tr><th>Date</th><th>Qty</th><th>Sell Price</th><th>Charges</th><th>Realized P&L (net)</th><th></th></tr></thead>
      <tbody>
        ${sells.map(sl => {
          const chg = sl.charges?.total || 0;
          const pnl = (sl.sellPrice - inv.avgPrice) * sl.quantity - chg;
          const cls = pnl >= 0 ? "positive" : "negative";
          return `<tr>
            <td>${formatDate(sl.sellDate)}</td>
            <td>${sl.quantity}</td>
            <td>${formatCurrency(sl.sellPrice)}</td>
            <td>${formatCurrency(chg)}</td>
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
    <div class="section-title small" style="margin-top:1rem">Charges</div>
    <div id="sell-charges-fields">${chargesFieldsHTML(inv.assetType, "sell")}</div>
    <div id="sell-charges-preview"></div>
    ${sellHistoryHTML}`;

  const footer = `
    <button class="btn btn-ghost" id="sell-cancel">Cancel</button>
    <button class="btn btn-primary" id="sell-confirm">Record Sale</button>`;

  openModal(`Sell — ${inv.name}`, body, footer);
  prefillChargeDefaults(inv.assetType, "sell");
  bindChargesLivePreview(inv.assetType, "sell", "sell-qty", "sell-price", "sell-charges-preview");

  const updatePreview = () => {
    const qty   = parseFloat(document.getElementById("sell-qty")?.value) || 0;
    const price = parseFloat(document.getElementById("sell-price")?.value) || 0;
    const el    = document.getElementById("sell-pnl-preview");
    if (!el || qty <= 0 || price <= 0) { if(el) el.innerHTML = ""; return; }
    const charges = readChargesFromFields(inv.assetType, "sell", qty, price);
    const pnl = (price - inv.avgPrice) * qty - charges.total;
    const cls = pnl >= 0 ? "positive" : "negative";
    el.innerHTML = `<div class="tax-highlight">
      Estimated Realized P&L (net of charges): <strong class="${cls}">${pnl>=0?"+":""}${formatCurrency(pnl)}</strong>
      &nbsp;·&nbsp; Proceeds: ${formatCurrency(price * qty)}
    </div>`;
  };
  document.getElementById("sell-qty")?.addEventListener("input", updatePreview);
  document.getElementById("sell-price")?.addEventListener("input", updatePreview);
  document.querySelectorAll("#sell-charges-fields input, #chg-trade-type").forEach(el => el.addEventListener("input", updatePreview));

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
    const charges  = readChargesFromFields(inv.assetType, "sell", qty, price);

    if (qty <= 0) { toast("Enter quantity to sell", "error"); return; }
    if (qty > available) { toast(`Only ${available} units available`, "error"); return; }
    if (price <= 0)  { toast("Enter a valid sell price", "error"); return; }

    await addSellTrade(inv.id, { quantity: qty, sellPrice: price, sellDate, notes, charges });

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

// ─── CHARGES UI (shared across Add / Buy More / Sell modals) ──────
const chargesFieldsHTML = (assetType, side) => {
  if (assetType === "Equity") {
    return `
      <div class="form-row">
        <label>Trade Type</label>
        <select id="chg-trade-type" class="input">
          <option value="Delivery">Delivery</option>
          <option value="Intraday">Intraday</option>
        </select>
      </div>
      <div class="charges-grid">
        <div class="form-row"><label>Brokerage (₹)</label><input type="number" id="chg-brokerage" class="input" step="0.01" /></div>
        <div class="form-row"><label>STT %</label><input type="number" id="chg-stt" class="input" step="0.001" /></div>
        <div class="form-row"><label>Exchange Charges %</label><input type="number" id="chg-exchange" class="input" step="0.0001" /></div>
        <div class="form-row"><label>SEBI Charges %</label><input type="number" id="chg-sebi" class="input" step="0.0001" /></div>
        <div class="form-row"><label>GST %</label><input type="number" id="chg-gst" class="input" step="0.1" /></div>
        ${side === "buy"
          ? `<div class="form-row"><label>Stamp Duty %</label><input type="number" id="chg-stampduty" class="input" step="0.001" /></div>`
          : `<div class="form-row"><label>DP Charge (₹)</label><input type="number" id="chg-dpcharge" class="input" step="0.01" /></div>`}
      </div>`;
  }
  if (assetType === "Mutual Fund") {
    return side === "buy"
      ? `<div class="charges-grid">
           <div class="form-row"><label>Stamp Duty %</label><input type="number" id="chg-stampduty" class="input" step="0.001" /></div>
           <div class="form-row"><label>Expense Ratio % <span class="muted" style="font-weight:400">(informational)</span></label><input type="number" id="chg-expenseratio" class="input" step="0.01" /></div>
         </div>`
      : `<div class="form-row"><label>Exit Load %</label><input type="number" id="chg-exitload" class="input" step="0.01" /></div>
         <div class="form-row"><label>Other Sell Charges (₹)</label><input type="number" id="chg-other" class="input" step="0.01" value="0" /></div>`;
  }
  if (assetType === "Commodity") {
    return `
      <div class="charges-grid">
        <div class="form-row"><label>Brokerage (₹)</label><input type="number" id="chg-brokerage" class="input" step="0.01" value="0" /></div>
        <div class="form-row"><label>GST %</label><input type="number" id="chg-gst" class="input" step="0.1" value="18" /></div>
        ${side === "sell" ? `<div class="form-row"><label>DP Charge (₹)</label><input type="number" id="chg-dpcharge" class="input" step="0.01" value="0" /></div>` : ""}
        <div class="form-row"><label>Other Charges (₹)</label><input type="number" id="chg-other" class="input" step="0.01" value="0" /></div>
      </div>`;
  }
  // FD and any custom asset type — generic charges, still present on both buy and sell
  return `<div class="form-row"><label>${side === "sell" ? "Sell " : ""}Other Charges (₹)</label><input type="number" id="chg-other" class="input" step="0.01" value="0" /></div>`;
};

const prefillChargeDefaults = (assetType, side) => {
  if (assetType === "Equity") {
    const tradeSel = document.getElementById("chg-trade-type");
    const applyDefaults = () => {
      const key = tradeSel.value === "Intraday"
        ? (side === "buy" ? "equityIntradayBuy" : "equityIntradaySell")
        : (side === "buy" ? "equityDeliveryBuy" : "equityDeliverySell");
      const d = CHARGE_DEFAULTS_REF[key];
      if (document.getElementById("chg-brokerage")) document.getElementById("chg-brokerage").value = d.brokerage || 0;
      if (document.getElementById("chg-stt")) document.getElementById("chg-stt").value = d.sttPct || 0;
      if (document.getElementById("chg-exchange")) document.getElementById("chg-exchange").value = d.exchangePct || 0;
      if (document.getElementById("chg-sebi")) document.getElementById("chg-sebi").value = d.sebiPct || 0;
      if (document.getElementById("chg-gst")) document.getElementById("chg-gst").value = d.gstPct || 0;
      if (document.getElementById("chg-stampduty")) document.getElementById("chg-stampduty").value = d.stampDutyPct || 0;
      if (document.getElementById("chg-dpcharge")) document.getElementById("chg-dpcharge").value = d.dpCharge || 0;
    };
    applyDefaults();
    tradeSel?.addEventListener("change", applyDefaults);
  } else if (assetType === "Mutual Fund") {
    if (document.getElementById("chg-stampduty")) document.getElementById("chg-stampduty").value = CHARGE_DEFAULTS_REF.mfBuy.stampDutyPct;
  }
};

const readChargesFromFields = (assetType, side, qty, price) => {
  const turnover = (qty || 0) * (price || 0);
  if (assetType === "Equity") {
    const tradeType = document.getElementById("chg-trade-type")?.value || "Delivery";
    const overrides = {
      brokerage:    parseFloat(document.getElementById("chg-brokerage")?.value) || 0,
      sttPct:       parseFloat(document.getElementById("chg-stt")?.value) || 0,
      exchangePct:  parseFloat(document.getElementById("chg-exchange")?.value) || 0,
      sebiPct:      parseFloat(document.getElementById("chg-sebi")?.value) || 0,
      gstPct:       parseFloat(document.getElementById("chg-gst")?.value) || 0,
      stampDutyPct: parseFloat(document.getElementById("chg-stampduty")?.value) || 0,
      dpCharge:     parseFloat(document.getElementById("chg-dpcharge")?.value) || 0,
    };
    return { ...calcEquityCharges(turnover, side, tradeType, overrides), tradeType };
  }
  if (assetType === "Mutual Fund") {
    const overrides = side === "buy"
      ? { stampDutyPct: parseFloat(document.getElementById("chg-stampduty")?.value) || 0, expenseRatioPct: parseFloat(document.getElementById("chg-expenseratio")?.value) || 0 }
      : { exitLoadPct: parseFloat(document.getElementById("chg-exitload")?.value) || 0 };
    const mfCharges = calcMFCharges(turnover, side, overrides);
    if (side === "sell") {
      const other = parseFloat(document.getElementById("chg-other")?.value) || 0;
      return { ...mfCharges, otherCharges: other, total: mfCharges.total + other };
    }
    return mfCharges;
  }
  if (assetType === "Commodity") {
    const overrides = {
      brokerage:    parseFloat(document.getElementById("chg-brokerage")?.value) || 0,
      gstPct:       parseFloat(document.getElementById("chg-gst")?.value) || 0,
      dpCharge:     parseFloat(document.getElementById("chg-dpcharge")?.value) || 0,
      otherCharges: parseFloat(document.getElementById("chg-other")?.value) || 0,
    };
    return calcCommodityCharges(side, overrides);
  }
  return calcGenericCharges({ otherCharges: parseFloat(document.getElementById("chg-other")?.value) || 0 });
};

const bindChargesLivePreview = (assetType, side, qtyElId, priceElId, previewElId) => {
  const update = () => {
    const qty = parseFloat(document.getElementById(qtyElId)?.value) || 0;
    const price = parseFloat(document.getElementById(priceElId)?.value) || 0;
    const charges = readChargesFromFields(assetType, side, qty, price);
    const el = document.getElementById(previewElId);
    if (el) el.innerHTML = `<div class="tax-highlight">Total Charges: <strong>${formatCurrency(charges.total)}</strong></div>`;
  };
  document.querySelectorAll(`#${qtyElId}, #${priceElId}, .charges-grid input, #chg-trade-type, #chg-other, #chg-exitload`).forEach(el => el?.addEventListener("input", update));
  document.getElementById("chg-trade-type")?.addEventListener("change", update);
  update();
};

const CHARGE_DEFAULTS_REF = {
  equityDeliveryBuy:  { brokerage: 0,  sttPct: 0.1,   exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0.015, dpCharge: 0 },
  equityDeliverySell: { brokerage: 0,  sttPct: 0.1,   exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0,     dpCharge: 18.75 },
  equityIntradayBuy:  { brokerage: 20, sttPct: 0,     exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0.003, dpCharge: 0 },
  equityIntradaySell: { brokerage: 20, sttPct: 0.025, exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0,     dpCharge: 0 },
  mfBuy: { stampDutyPct: 0.005 },
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
        ${getAllAssetTypes().map(t => `<option value="${t}" ${inv?.assetType===t?"selected":""}>${t}</option>`).join("")}
        ${!isEdit ? `<option value="__add_new__">+ Add New Asset Type…</option>` : ""}
      </select>
    </div>
    <div class="form-row hidden" id="inv-m-new-type-row">
      <label>New Asset Type Name</label>
      <input type="text" id="inv-m-new-type" class="input" placeholder="e.g. US Stocks, Japan Stocks" />
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
    ${!isEdit ? `
      <div class="section-title small" style="margin-top:1rem">Charges</div>
      <div id="inv-m-charges-fields">${chargesFieldsHTML(inv?.assetType || getAllAssetTypes()[0], "buy")}</div>
      <div id="inv-m-charges-preview"></div>
    ` : ""}
    ${!isEdit ? `<div class="muted" style="font-size:0.72rem;margin-top:0.5rem">If Name + Asset Type + Broker + Sector match an existing holding, this will be added as another purchase (averaged in) instead of a new row.</div>` : ""}`;

  const footer = `
    ${isEdit ? `<button class="btn btn-danger btn-sm" id="inv-m-delete">Delete</button>` : ""}
    <button class="btn btn-ghost" id="inv-m-cancel">Cancel</button>
    <button class="btn btn-primary" id="inv-m-save">${isEdit ? "Update" : "Add"}</button>`;

  openModal(isEdit ? "Edit Investment" : "Add Investment", body, footer);

  if (!isEdit) {
    const refreshCharges = () => {
      const type = document.getElementById("inv-m-type").value;
      const actualType = type === "__add_new__" ? (document.getElementById("inv-m-new-type")?.value || "Other") : type;
      document.getElementById("inv-m-charges-fields").innerHTML = chargesFieldsHTML(actualType, "buy");
      prefillChargeDefaults(actualType, "buy");
      bindChargesLivePreview(actualType, "buy", "inv-m-qty", "inv-m-avg", "inv-m-charges-preview");
    };
    document.getElementById("inv-m-type").addEventListener("change", (e) => {
      document.getElementById("inv-m-new-type-row").classList.toggle("hidden", e.target.value !== "__add_new__");
      refreshCharges();
    });
    refreshCharges();
  }

  document.getElementById("inv-m-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("inv-m-delete").onclick = () => confirmDeleteInv(inv.id);
  document.getElementById("inv-m-save").onclick = () => saveInv(inv?.id);
};

const saveInv = async (editId) => {
  let assetType = document.getElementById("inv-m-type").value;
  if (assetType === "__add_new__") {
    const newTypeName = document.getElementById("inv-m-new-type")?.value.trim();
    if (!newTypeName) { toast("Enter a name for the new asset type", "error"); return; }
    addCustomType(newTypeName);
    assetType = newTypeName;
  }

  const data = {
    assetType,
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
  const charges = !editId ? readChargesFromFields(assetType, "buy", qty, price) : null;

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
        await addBuyLot(match.id, { quantity: qty, price, date, notes: data.notes, charges });
        await recalcFromBuyLots(match.id);
        if (data.currentPrice) await saveInvestment(match.id, { currentPrice: data.currentPrice, isin: data.isin || match.isin });
        toast(`Added to existing ${match.name} holding — averaged in`, "success");
      } else {
        const newId = await saveInvestment(null, { ...data, quantity: qty, avgPrice: price, purchaseDate: date });
        await addBuyLot(newId, { quantity: qty, price, date, notes: data.notes, charges });
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
