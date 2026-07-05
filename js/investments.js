// ============================================================
// js/investments.js – Investments CRUD, Sells, Realized/Unrealized P&L
// ============================================================
import {
  saveInvestment, getInvestments, deleteInvestment,
  addSellTrade, getSellTrades, deleteSellTrade
} from "./database.js";
import { formatCurrency, formatDate, todayISO, toast, openModal, closeModal, pct } from "./utils.js";
import { renderInvCharts } from "./charts.js";

let _investments = [];                 // open + partially-sold holdings
let _allSells    = {};                 // { investmentId: [sell, ...] }

export const initInvestments = async () => {
  _investments = await getInvestments();
  // Load sell trades for every holding (parallel)
  const sellResults = await Promise.all(
    _investments.map(inv => getSellTrades(inv.id).then(sells => ({ id: inv.id, sells })))
  );
  _allSells = {};
  sellResults.forEach(r => { _allSells[r.id] = r.sells; });
  renderInvestmentsPage();
};

export const getInvestmentsData = () => _investments;
export const getAllSells = () => _allSells;

// ─── P&L HELPERS ──────────────────────────────────────────────
// Realized P&L for one holding = Σ (sellPrice - avgPrice) * sellQty
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

// Unrealized P&L = (currentPrice - avgPrice) * openQty
const unrealizedForHolding = (inv) => {
  const qty = openQty(inv);
  return ((inv.currentPrice || inv.avgPrice) - inv.avgPrice) * qty;
};

// ─── PAGE AGGREGATES ──────────────────────────────────────────
export const aggregateInvestments = (invs) => {
  let totalInvested = 0, currentValue = 0, realized = 0, unrealized = 0;
  for (const inv of invs) {
    const oQty = openQty(inv);
    totalInvested += (inv.avgPrice * inv.quantity) || 0;
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

// ─── INVESTMENT TABLE ─────────────────────────────────────────
const TYPE_MAP = {
  "equity":       ["equity","stocks"],
  "mutual-funds": ["mutual fund","mf","etf"],
  "gold":         ["gold"],
  "crypto":       ["crypto","bitcoin","cryptocurrency"],
  "fd":           ["fd","ppf","epf","nps","fixed deposit"],
};

const renderInvTable = (tab) => {
  const keywords = TYPE_MAP[tab] || [];
  const filtered = _investments.filter(inv => {
    const type = (inv.assetType || inv.type || "").toLowerCase();
    return keywords.some(k => type.includes(k));
  });

  const container = document.getElementById("inv-table-container");
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="trending-up"></i><p>No ${tab} holdings. Add one!</p></div>`;
    lucide.createIcons();
    return;
  }

  const rows = filtered.map(inv => {
    const oQty       = openQty(inv);
    const invested   = inv.avgPrice * inv.quantity;
    const curVal     = (inv.currentPrice || inv.avgPrice) * oQty;
    const unreal     = unrealizedForHolding(inv);
    const real       = realizedForHolding(inv);
    const unrCls     = unreal >= 0 ? "positive" : "negative";
    const realCls    = real  >= 0 ? "positive" : "negative";
    const sells      = _allSells[inv.id] || [];
    const soldQty    = sells.reduce((s, sl) => s + sl.quantity, 0);

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
        <td>${formatCurrency(inv.avgPrice, inv.currency||"INR")}</td>
        <td>${formatCurrency(inv.currentPrice||inv.avgPrice, inv.currency||"INR")}</td>
        <td>${formatCurrency(invested, inv.currency||"INR")}</td>
        <td>${formatCurrency(curVal, inv.currency||"INR")}</td>
        <td class="${unrCls}">${unreal>=0?"+":""}${formatCurrency(unreal, inv.currency||"INR")}</td>
        <td class="${realCls}">${real>=0?"+":""}${formatCurrency(real, inv.currency||"INR")}</td>
        <td>
          <button class="btn btn-ghost btn-sm inv-edit"  data-id="${inv.id}">Edit</button>
          ${oQty > 0 ? `<button class="btn btn-outline btn-sm inv-sell" data-id="${inv.id}">Sell</button>` : ""}
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
  container.querySelectorAll(".inv-del").forEach(btn =>
    btn.onclick = () => confirmDeleteInv(btn.dataset.id)
  );
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
            <td>${formatCurrency(sl.sellPrice, inv.currency||"INR")}</td>
            <td class="${cls}">${pnl>=0?"+":""}${formatCurrency(pnl, inv.currency||"INR")}</td>
            <td><button class="btn btn-danger btn-sm" data-del-sell="${sl.id}">×</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  const body = `
    <div class="muted" style="font-size:0.85rem;margin-bottom:var(--sp-md)">
      <strong>${inv.name}</strong> &nbsp;·&nbsp; Avg buy: ${formatCurrency(inv.avgPrice, inv.currency||"INR")} &nbsp;·&nbsp; Available qty: <strong>${available}</strong>
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

  // Live P&L preview
  const updatePreview = () => {
    const qty   = parseFloat(document.getElementById("sell-qty")?.value) || 0;
    const price = parseFloat(document.getElementById("sell-price")?.value) || 0;
    const el    = document.getElementById("sell-pnl-preview");
    if (!el || qty <= 0 || price <= 0) { if(el) el.innerHTML = ""; return; }
    const pnl = (price - inv.avgPrice) * qty;
    const cls = pnl >= 0 ? "positive" : "negative";
    el.innerHTML = `<div class="tax-highlight">
      Estimated Realized P&L: <strong class="${cls}">${pnl>=0?"+":""}${formatCurrency(pnl, inv.currency||"INR")}</strong>
      &nbsp;·&nbsp; Proceeds: ${formatCurrency(price * qty, inv.currency||"INR")}
    </div>`;
  };
  document.getElementById("sell-qty")?.addEventListener("input", updatePreview);
  document.getElementById("sell-price")?.addEventListener("input", updatePreview);

  // Delete sell trade buttons in history
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

    // If all units sold, mark holding as fully exited (keep for history)
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

// ─── ADD / EDIT MODAL ─────────────────────────────────────────
export const openInvModal = (inv) => {
  const isEdit = !!inv;
  const ASSET_TYPES = ["Equity","Mutual Fund","ETF","Gold","Crypto","FD","PPF","EPF","NPS","Real Estate","Cash"];

  const body = `
    <div class="form-row">
      <label>Asset Type</label>
      <select id="inv-m-type" class="input">
        ${ASSET_TYPES.map(t => `<option value="${t}" ${inv?.assetType===t?"selected":""}>${t}</option>`).join("")}
      </select>
    </div>
    <div class="form-row">
      <label>Name / Symbol</label>
      <input type="text" id="inv-m-name" class="input" placeholder="e.g. RELIANCE, SBI Bluechip" value="${inv?.name||""}" />
    </div>
    <div class="form-row">
      <label>ISIN (optional)</label>
      <input type="text" id="inv-m-isin" class="input" placeholder="e.g. INE002A01018" value="${inv?.isin||""}" />
    </div>
    <div class="form-row-inline">
      <div class="form-row">
        <label>Total Quantity Bought</label>
        <input type="number" id="inv-m-qty" class="input" placeholder="0" value="${inv?.quantity||""}" step="0.001" />
      </div>
      <div class="form-row">
        <label>Currency</label>
        <select id="inv-m-currency" class="input">
          ${["INR","SAR","USD","AED","GBP","EUR"].map(c => `<option value="${c}" ${inv?.currency===c?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-row-inline">
      <div class="form-row">
        <label>Average Buy Price</label>
        <input type="number" id="inv-m-avg" class="input" placeholder="0.00" value="${inv?.avgPrice||""}" step="0.01" />
      </div>
      <div class="form-row">
        <label>Current Price</label>
        <input type="number" id="inv-m-current" class="input" placeholder="0.00" value="${inv?.currentPrice||""}" step="0.01" />
      </div>
    </div>
    <div class="form-row">
      <label>Broker / Platform</label>
      <input type="text" id="inv-m-broker" class="input" placeholder="e.g. Zerodha, Groww" value="${inv?.broker||""}" />
    </div>
    <div class="form-row">
      <label>Sector</label>
      <input type="text" id="inv-m-sector" class="input" placeholder="e.g. Technology, Finance" value="${inv?.sector||""}" />
    </div>
    <div class="form-row">
      <label>Purchase Date</label>
      <input type="date" id="inv-m-date" class="input" value="${inv?.purchaseDate||todayISO()}" />
    </div>
    <div class="form-row">
      <label>Notes</label>
      <input type="text" id="inv-m-notes" class="input" placeholder="Optional" value="${inv?.notes||""}" />
    </div>`;

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
    quantity:     parseFloat(document.getElementById("inv-m-qty").value) || 0,
    currency:     document.getElementById("inv-m-currency").value,
    avgPrice:     parseFloat(document.getElementById("inv-m-avg").value) || 0,
    currentPrice: parseFloat(document.getElementById("inv-m-current").value) || 0,
    broker:       document.getElementById("inv-m-broker").value.trim(),
    sector:       document.getElementById("inv-m-sector").value.trim(),
    purchaseDate: document.getElementById("inv-m-date").value,
    notes:        document.getElementById("inv-m-notes").value.trim(),
  };

  try {
    await saveInvestment(editId || null, data);
    toast(editId ? "Investment updated" : "Investment added", "success");
    closeModal();
    _investments = await getInvestments();
    const sellResults = await Promise.all(
      _investments.map(inv => getSellTrades(inv.id).then(sells => ({ id: inv.id, sells })))
    );
    _allSells = {};
    sellResults.forEach(r => { _allSells[r.id] = r.sells; });
    renderInvestmentsPage();
    window.dispatchEvent(new Event("data:changed"));
  } catch (err) {
    toast("Error saving investment", "error");
    console.error(err);
  }
};

const confirmDeleteInv = async (id) => {
  if (!confirm("Delete this investment and all its sell records?")) return;
  await deleteInvestment(id);
  toast("Investment deleted");
  closeModal();
  _investments = await getInvestments();
  delete _allSells[id];
  renderInvestmentsPage();
  window.dispatchEvent(new Event("data:changed"));
};
