// ============================================================
// js/investments.js  – Investments CRUD & rendering
// ============================================================
import { saveInvestment, getInvestments, deleteInvestment } from "./database.js";
import { formatCurrency, formatDate, todayISO, toast, openModal, closeModal, pct } from "./utils.js";
import { renderInvCharts } from "./charts.js";

let _investments = [];

export const initInvestments = async () => {
  _investments = await getInvestments();
  renderInvestmentsPage();
};

export const getInvestmentsData = () => _investments;

// ─── RENDER PAGE ─────────────────────────────────────────────
export const renderInvestmentsPage = () => {
  const data = aggregateInvestments(_investments);

  document.getElementById("inv-total-invested").textContent = formatCurrency(data.totalInvested, "INR", true);
  document.getElementById("inv-total-value").textContent    = formatCurrency(data.currentValue,  "INR", true);
  document.getElementById("inv-total-profit").textContent   = formatCurrency(data.gain,           "INR", true);
  document.getElementById("inv-unrealized").textContent     = formatCurrency(data.unrealized,     "INR", true);

  // Charts
  renderInvCharts(_investments);

  // Table by active tab
  const activeTab = document.querySelector("#inv-tabs .tab.active")?.dataset.tab || "equity";
  renderInvTable(activeTab);

  // Tab events
  document.querySelectorAll("#inv-tabs .tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll("#inv-tabs .tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      renderInvTable(tab.dataset.tab);
    };
  });
};

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
    const gain    = (inv.currentPrice * inv.quantity) - (inv.avgPrice * inv.quantity);
    const gainPct = pct(gain, inv.avgPrice * inv.quantity);
    const gainCls = gain >= 0 ? "positive" : "negative";
    return `
      <tr data-id="${inv.id}">
        <td><strong>${inv.name}</strong><div class="muted" style="font-size:0.72rem">${inv.broker||""}</div></td>
        <td>${inv.quantity}</td>
        <td>${formatCurrency(inv.avgPrice, inv.currency||"INR")}</td>
        <td>${formatCurrency(inv.currentPrice||inv.avgPrice, inv.currency||"INR")}</td>
        <td>${formatCurrency(inv.avgPrice*inv.quantity, inv.currency||"INR")}</td>
        <td>${formatCurrency((inv.currentPrice||inv.avgPrice)*inv.quantity, inv.currency||"INR")}</td>
        <td class="${gainCls}">${gain>=0?"+":""}${formatCurrency(gain, inv.currency||"INR")}</td>
        <td class="${gainCls}">${gainPct.toFixed(2)}%</td>
        <td>
          <button class="btn btn-ghost btn-sm inv-edit" data-id="${inv.id}">Edit</button>
          <button class="btn btn-danger btn-sm inv-del"  data-id="${inv.id}">Del</button>
        </td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="inv-table-wrap">
      <table class="inv-table">
        <thead>
          <tr>
            <th>Name / Broker</th><th>Qty</th><th>Avg Price</th><th>Current</th>
            <th>Invested</th><th>Current Value</th><th>P&L</th><th>%</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll(".inv-edit").forEach(btn =>
    btn.onclick = () => openInvModal(_investments.find(i=>i.id===btn.dataset.id))
  );
  container.querySelectorAll(".inv-del").forEach(btn =>
    btn.onclick = () => confirmDeleteInv(btn.dataset.id)
  );
};

// ─── AGGREGATES ───────────────────────────────────────────────
export const aggregateInvestments = (invs) => {
  let totalInvested = 0, currentValue = 0;
  for (const inv of invs) {
    totalInvested += (inv.avgPrice * inv.quantity) || 0;
    currentValue  += ((inv.currentPrice || inv.avgPrice) * inv.quantity) || 0;
  }
  return {
    totalInvested,
    currentValue,
    gain:       currentValue - totalInvested,
    unrealized: currentValue - totalInvested,
  };
};

// ─── ADD / EDIT MODAL ────────────────────────────────────────
export const openInvModal = (inv) => {
  const isEdit = !!inv;
  const ASSET_TYPES = ["Equity","Mutual Fund","ETF","Gold","Crypto","FD","PPF","EPF","NPS","Real Estate","Cash"];

  const body = `
    <div class="form-row">
      <label>Asset Type</label>
      <select id="inv-m-type" class="input">
        ${ASSET_TYPES.map(t=>`<option value="${t}" ${inv?.assetType===t?"selected":""}>${t}</option>`).join("")}
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
        <label>Quantity</label>
        <input type="number" id="inv-m-qty" class="input" placeholder="0" value="${inv?.quantity||""}" step="0.001" />
      </div>
      <div class="form-row">
        <label>Currency</label>
        <select id="inv-m-currency" class="input">
          ${["INR","SAR","USD"].map(c=>`<option value="${c}" ${inv?.currency===c?"selected":""}>${c}</option>`).join("")}
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
    <button class="btn btn-primary" id="inv-m-save">${isEdit?"Update":"Add"}</button>`;

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
    await saveInvestment(editId||null, data);
    toast(editId ? "Investment updated" : "Investment added", "success");
    closeModal();
    _investments = await getInvestments();
    renderInvestmentsPage();
    window.dispatchEvent(new Event("data:changed"));
  } catch(err) {
    toast("Error saving investment","error"); console.error(err);
  }
};

const confirmDeleteInv = async (id) => {
  if (!confirm("Delete this investment?")) return;
  await deleteInvestment(id);
  toast("Investment deleted");
  closeModal();
  _investments = await getInvestments();
  renderInvestmentsPage();
  window.dispatchEvent(new Event("data:changed"));
};
