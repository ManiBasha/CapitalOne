// ============================================================
// js/wealth.js – Assets, Liabilities, Net Worth
// ============================================================
import { saveAsset, getAssets, deleteAsset, saveLiability, getLiabilities, deleteLiability } from "./database.js?v=20260705b";
import { formatCurrency, formatDate, todayISO, toast, openModal, closeModal } from "./utils.js?v=20260705b";
import { renderAssetAllocChart, renderNWTimeline } from "./charts.js?v=20260705b";

let _assets = [], _liabilities = [];

export const initWealth = async () => {
  _assets = await getAssets();
  _liabilities = await getLiabilities();
  renderWealthPage();
};

export const getWealthData = () => ({ assets: _assets, liabilities: _liabilities });

export const renderWealthPage = () => {
  const totalAssets = _assets.reduce((s,a)=>s+(a.currentValue||a.value||0),0);
  const totalLiab   = _liabilities.reduce((s,l)=>s+(l.outstanding||0),0);
  const netWorth    = totalAssets - totalLiab;

  document.getElementById("wealth-assets").textContent = formatCurrency(totalAssets, "INR", true);
  document.getElementById("wealth-liabilities").textContent = formatCurrency(totalLiab, "INR", true);
  document.getElementById("wealth-networth").textContent = formatCurrency(netWorth, "INR", true);

  renderAssetAllocChart(_assets);
  renderNWTimeline([]);

  renderAssetsTable();
  renderLiabilitiesTable();
};

const renderAssetsTable = () => {
  const container = document.getElementById("assets-table-container");
  if (!container) return;
  if (_assets.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="landmark"></i><p>No assets added yet</p>
      <button class="btn btn-primary btn-sm" id="btn-add-asset-empty"><i data-lucide="plus"></i> Add Asset</button></div>`;
    lucide.createIcons();
    document.getElementById("btn-add-asset-empty")?.addEventListener("click", () => openAssetModal());
    return;
  }
  container.innerHTML = `
    <table class="asset-table">
      <thead><tr><th>Category</th><th>Invested</th><th>Current</th><th>Gain</th><th>Gain %</th><th>Currency</th><th>Updated</th><th></th></tr></thead>
      <tbody>
        ${_assets.map(a => {
          const gain = (a.currentValue||0) - (a.investedValue||0);
          const gainPct = a.investedValue ? (gain/a.investedValue*100).toFixed(2) : "0.00";
          const cls = gain >= 0 ? "positive" : "negative";
          return `<tr>
            <td><strong>${a.name}</strong><div class="muted" style="font-size:0.72rem">${a.category||""}</div></td>
            <td>${formatCurrency(a.investedValue||0, a.currency||"INR")}</td>
            <td>${formatCurrency(a.currentValue||0, a.currency||"INR")}</td>
            <td class="${cls}">${gain>=0?"+":""}${formatCurrency(gain, a.currency||"INR")}</td>
            <td class="${cls}">${gainPct}%</td>
            <td>${a.currency||"INR"}</td>
            <td class="muted" style="font-size:0.78rem">${formatDate(a.updatedDate||a.createdAt)}</td>
            <td>
              <button class="btn btn-ghost btn-sm" data-edit-asset="${a.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-del-asset="${a.id}">Del</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    <button class="btn btn-primary btn-sm" id="btn-add-asset" style="margin-top:var(--sp-md)"><i data-lucide="plus"></i> Add Asset</button>`;
  lucide.createIcons();

  document.getElementById("btn-add-asset")?.addEventListener("click", () => openAssetModal());
  container.querySelectorAll("[data-edit-asset]").forEach(b=>b.onclick=()=>openAssetModal(_assets.find(a=>a.id===b.dataset.editAsset)));
  container.querySelectorAll("[data-del-asset]").forEach(b=>b.onclick=()=>confirmDeleteAsset(b.dataset.delAsset));
};

const renderLiabilitiesTable = () => {
  const container = document.getElementById("liabilities-table-container");
  if (!container) return;
  if (_liabilities.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="banknote"></i><p>No liabilities added</p>
      <button class="btn btn-primary btn-sm" id="btn-add-liab-empty"><i data-lucide="plus"></i> Add Liability</button></div>`;
    lucide.createIcons();
    document.getElementById("btn-add-liab-empty")?.addEventListener("click", () => openLiabilityModal());
    return;
  }
  container.innerHTML = `
    <table class="asset-table">
      <thead><tr><th>Loan</th><th>Total</th><th>Outstanding</th><th>Interest</th><th>EMI</th><th>Months Left</th><th></th></tr></thead>
      <tbody>
        ${_liabilities.map(l => `
          <tr>
            <td><strong>${l.name}</strong></td>
            <td>${formatCurrency(l.totalAmount||0, l.currency||"INR")}</td>
            <td class="negative">${formatCurrency(l.outstanding||0, l.currency||"INR")}</td>
            <td>${l.interestRate||0}%</td>
            <td>${l.emi ? formatCurrency(l.emi, l.currency||"INR") : "—"}</td>
            <td>${l.remainingMonths || "—"}</td>
            <td>
              <button class="btn btn-ghost btn-sm" data-edit-liab="${l.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-del-liab="${l.id}">Del</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
    <button class="btn btn-primary btn-sm" id="btn-add-liab" style="margin-top:var(--sp-md)"><i data-lucide="plus"></i> Add Liability</button>`;
  lucide.createIcons();

  document.getElementById("btn-add-liab")?.addEventListener("click", () => openLiabilityModal());
  container.querySelectorAll("[data-edit-liab]").forEach(b=>b.onclick=()=>openLiabilityModal(_liabilities.find(l=>l.id===b.dataset.editLiab)));
  container.querySelectorAll("[data-del-liab]").forEach(b=>b.onclick=()=>confirmDeleteLiability(b.dataset.delLiab));
};

// ─── ASSET MODAL ──────────────────────────────────────────────
const ASSET_CATEGORIES = ["Real Estate","Vehicle","Gold/Jewelry","Cash","Bank Deposit","Other","+ Add New Category"];

const openAssetModal = (asset) => {
  const isEdit = !!asset;
  const isCustomCat = asset?.category && !ASSET_CATEGORIES.slice(0,-1).includes(asset.category);
  const body = `
    <div class="form-row"><label>Category</label>
      <select id="a-category" class="input">${ASSET_CATEGORIES.map(c=>`<option ${(isCustomCat?"+ Add New Category":asset?.category)===c?"selected":""}>${c}</option>`).join("")}</select>
    </div>
    <div class="form-row hidden" id="a-newcat-row"><label>New Category Name</label>
      <input id="a-newcat" class="input" placeholder="e.g. Crypto Wallet, Art" value="${isCustomCat?asset.category:""}" /></div>
    <div class="form-row"><label>Name</label>
      <input id="a-name" class="input" placeholder="e.g. Apartment in Riyadh" value="${asset?.name||""}" /></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Invested Value</label><input type="number" id="a-invested" class="input" value="${asset?.investedValue||""}" /></div>
      <div class="form-row"><label>Current Value</label><input type="number" id="a-current" class="input" value="${asset?.currentValue||""}" /></div>
    </div>
    <div class="form-row"><label>Notes</label><input id="a-notes" class="input" value="${asset?.notes||""}" /></div>`;
  const footer = `${isEdit?`<button class="btn btn-danger btn-sm" id="a-delete">Delete</button>`:""}
    <button class="btn btn-ghost" id="a-cancel">Cancel</button>
    <button class="btn btn-primary" id="a-save">${isEdit?"Update":"Add"}</button>`;
  openModal(isEdit?"Edit Asset":"Add Asset", body, footer);

  const catSel = document.getElementById("a-category");
  const newCatRow = document.getElementById("a-newcat-row");
  const toggleNewCat = () => newCatRow.classList.toggle("hidden", catSel.value !== "+ Add New Category");
  catSel.onchange = toggleNewCat;
  toggleNewCat();

  document.getElementById("a-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("a-delete").onclick = () => confirmDeleteAsset(asset.id);
  document.getElementById("a-save").onclick = async () => {
    const catValue = catSel.value === "+ Add New Category"
      ? document.getElementById("a-newcat").value.trim() || "Other"
      : catSel.value;
    const data = {
      category: catValue,
      name: document.getElementById("a-name").value.trim(),
      investedValue: parseFloat(document.getElementById("a-invested").value)||0,
      currentValue: parseFloat(document.getElementById("a-current").value)||0,
      currency: "INR",
      notes: document.getElementById("a-notes").value.trim(),
      updatedDate: todayISO(),
    };
    await saveAsset(asset?.id||null, data);
    toast(isEdit?"Asset updated":"Asset added","success");
    closeModal();
    _assets = await getAssets();
    renderWealthPage();
    window.dispatchEvent(new Event("data:changed"));
  };
};

const confirmDeleteAsset = async (id) => {
  if (!confirm("Delete this asset?")) return;
  await deleteAsset(id);
  toast("Asset deleted");
  closeModal();
  _assets = await getAssets();
  renderWealthPage();
  window.dispatchEvent(new Event("data:changed"));
};

// ─── LIABILITY MODAL ──────────────────────────────────────────
const openLiabilityModal = (liab) => {
  const isEdit = !!liab;
  const body = `
    <div class="form-row"><label>Loan Name</label><input id="l-name" class="input" placeholder="e.g. Home Loan" value="${liab?.name||""}" /></div>
    <div class="form-row"><label>Total Liability (original)</label><input type="number" id="l-total" class="input" value="${liab?.totalAmount||""}" /></div>
    <div class="form-row"><label>Outstanding Amount</label><input type="number" id="l-outstanding" class="input" value="${liab?.outstanding||""}" /></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Interest Rate (% p.a.)</label><input type="number" id="l-interest" class="input" value="${liab?.interestRate||""}" /></div>
      <div class="form-row"><label>Loan Start Date</label><input type="date" id="l-startdate" class="input" value="${liab?.startDate||""}" /></div>
    </div>
    <p class="muted" style="font-size:0.78rem;margin:4px 0 8px">Provide either Monthly EMI or Remaining Months — the other is auto-calculated. Leave both blank if there's no fixed end date (e.g. revolving credit).</p>
    <div class="form-row-inline">
      <div class="form-row"><label>Monthly EMI (optional)</label><input type="number" id="l-emi" class="input" placeholder="auto-calculated" value="${liab?.emi||""}" /></div>
      <div class="form-row"><label>Remaining Months (optional)</label><input type="number" id="l-months" class="input" placeholder="auto-calculated" value="${liab?.remainingMonths||""}" /></div>
    </div>
    <div class="form-row"><label>Notes</label><input id="l-notes" class="input" value="${liab?.notes||""}" /></div>`;
  const footer = `${isEdit?`<button class="btn btn-danger btn-sm" id="l-delete">Delete</button>`:""}
    <button class="btn btn-ghost" id="l-cancel">Cancel</button>
    <button class="btn btn-primary" id="l-save">${isEdit?"Update":"Add"}</button>`;
  openModal(isEdit?"Edit Liability":"Add Liability", body, footer);
  document.getElementById("l-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("l-delete").onclick = () => confirmDeleteLiability(liab.id);
  document.getElementById("l-save").onclick = async () => {
    const outstanding   = parseFloat(document.getElementById("l-outstanding").value)||0;
    const interestRate  = parseFloat(document.getElementById("l-interest").value)||0;
    let emi             = parseFloat(document.getElementById("l-emi").value)||0;
    let remainingMonths = parseInt(document.getElementById("l-months").value)||0;

    // Auto-calc whichever is missing using standard amortization formula
    const monthlyRate = interestRate / 100 / 12;
    if (outstanding > 0 && monthlyRate > 0) {
      if (emi > 0 && !remainingMonths) {
        // n = -log(1 - (P*r)/E) / log(1+r)
        const ratio = 1 - (outstanding * monthlyRate) / emi;
        if (ratio > 0) remainingMonths = Math.ceil(-Math.log(ratio) / Math.log(1 + monthlyRate));
      } else if (remainingMonths > 0 && !emi) {
        emi = (outstanding * monthlyRate * Math.pow(1+monthlyRate, remainingMonths)) /
              (Math.pow(1+monthlyRate, remainingMonths) - 1);
      }
    }

    const data = {
      name: document.getElementById("l-name").value.trim(),
      totalAmount: parseFloat(document.getElementById("l-total").value)||0,
      currency: "INR",
      outstanding,
      interestRate,
      startDate: document.getElementById("l-startdate").value,
      emi: Math.round(emi*100)/100,
      remainingMonths,
      notes: document.getElementById("l-notes").value.trim(),
    };
    await saveLiability(liab?.id||null, data);
    toast(isEdit?"Liability updated":"Liability added","success");
    closeModal();
    _liabilities = await getLiabilities();
    renderWealthPage();
    window.dispatchEvent(new Event("data:changed"));
  };
};

const confirmDeleteLiability = async (id) => {
  if (!confirm("Delete this liability?")) return;
  await deleteLiability(id);
  toast("Liability deleted");
  closeModal();
  _liabilities = await getLiabilities();
  renderWealthPage();
  window.dispatchEvent(new Event("data:changed"));
};
