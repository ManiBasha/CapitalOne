// ============================================================
// js/transactions.js  – Transaction CRUD & rendering
// ============================================================
import {
  addTransaction, updateTransaction, deleteTransaction, getTransactions,
  getAccounts, getCategories
} from "./database.js";
import { formatCurrency, formatDate, todayISO, toast, openModal, closeModal, convertCurrency, exchangeRates } from "./utils.js";

let _transactions = [];
let _accounts     = [];
let _categories   = [];
let _page         = 1;
const PAGE_SIZE   = 30;

export const initTransactions = async () => {
  _accounts   = await getAccounts();
  _categories = await getCategories();
  bindFilterEvents();
};

export const loadTransactions = async (filters = {}) => {
  _transactions = await getTransactions(filters);
  renderTransactionList(_transactions);
  populateAccountFilter();
  return _transactions;
};

// ─── RENDER ──────────────────────────────────────────────────
export const renderTransactionList = (txns, containerId = "txn-list") => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const start = (_page - 1) * PAGE_SIZE;
  const page  = txns.slice(start, start + PAGE_SIZE);

  if (txns.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="receipt"></i>
        <p>No transactions yet. Add your first one!</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  container.innerHTML = page.map(txn => txnHTML(txn)).join("");
  lucide.createIcons();
  renderPagination(txns.length, containerId);

  container.querySelectorAll(".txn-item").forEach(el => {
    el.addEventListener("click", () => openEditModal(el.dataset.id));
  });
};

const txnHTML = (txn) => {
  const cat  = _categories.find(c => c.id === txn.categoryId);
  const sign = txn.type === "income" ? "+" : txn.type === "expense" ? "-" : "↔";
  const cls  = txn.type === "income" ? "positive" : txn.type === "expense" ? "negative" : "";
  const bgStyle = cat?.color ? `background:${cat.color}22; color:${cat.color}` : "background:var(--c-primary-light);color:var(--c-primary)";

  return `
    <div class="txn-item" data-id="${txn.id}">
      <div class="txn-icon" style="${bgStyle}">${cat?.emoji || "💳"}</div>
      <div class="txn-info">
        <div class="txn-title">${txn.title || "Untitled"}</div>
        <div class="txn-meta">${cat?.name || "Uncategorised"} · ${txn.accountId ? (_accounts.find(a=>a.id===txn.accountId)?.name || '') : ''}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${cls}">${sign}${formatCurrency(txn.amount, txn.currency || "INR")}</div>
        <div class="txn-date">${formatDate(txn.date)}</div>
      </div>
    </div>`;
};

const renderPagination = (total, containerId) => {
  const pages = Math.ceil(total / PAGE_SIZE);
  const pag = document.getElementById("txn-pagination");
  if (!pag || pages <= 1) return;

  pag.innerHTML = Array.from({ length: pages }, (_, i) =>
    `<button class="pg-btn ${i + 1 === _page ? "active" : ""}" data-pg="${i + 1}">${i + 1}</button>`
  ).join("");

  pag.querySelectorAll(".pg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _page = +btn.dataset.pg;
      renderTransactionList(_transactions);
    });
  });
};

// ─── ADD / EDIT MODAL ────────────────────────────────────────
export const openAddModal = () => openTxnModal(null);
export const openEditModal = (id) => {
  const txn = _transactions.find(t => t.id === id);
  openTxnModal(txn);
};

const openTxnModal = (txn) => {
  const isEdit = !!txn;
  const cats   = _categories;
  const accs   = _accounts;

  const body = `
    <div class="form-row">
      <label>Date</label>
      <input type="date" id="m-date" class="input" value="${txn?.date || todayISO()}" />
    </div>
    <div class="form-row-inline">
      <div class="form-row" style="flex:2">
        <label>Amount</label>
        <input type="number" id="m-amount" class="input" placeholder="0.00" value="${txn?.amount || ""}" step="0.01" />
      </div>
      <div class="form-row">
        <label>Currency</label>
        <select id="m-currency" class="input">
          ${["INR","SAR","USD","AED","GBP","EUR"].map(c=>
            `<option value="${c}" ${txn?.currency===c?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-row">
      <label>Type</label>
      <select id="m-type" class="input">
        <option value="expense" ${txn?.type==="expense"?"selected":""}>Expense</option>
        <option value="income"  ${txn?.type==="income" ?"selected":""}>Income</option>
        <option value="transfer"${txn?.type==="transfer"?"selected":""}>Transfer</option>
      </select>
    </div>
    <div class="form-row">
      <label>Account</label>
      <select id="m-account" class="input">
        <option value="">Select Account</option>
        ${accs.map(a=>`<option value="${a.id}" ${txn?.accountId===a.id?"selected":""}>${a.name}</option>`).join("")}
      </select>
    </div>
    <div class="form-row">
      <label>Category</label>
      <select id="m-category" class="input">
        <option value="">Select Category</option>
        ${cats.map(c=>`<option value="${c.id}" ${txn?.categoryId===c.id?"selected":""}>${c.emoji||""} ${c.name}</option>`).join("")}
      </select>
    </div>
    <div class="form-row">
      <label>Title</label>
      <input type="text" id="m-title" class="input" placeholder="e.g. Grocery shopping" value="${txn?.title||""}" />
    </div>
    <div class="form-row">
      <label>Notes</label>
      <input type="text" id="m-notes" class="input" placeholder="Optional notes" value="${txn?.notes||""}" />
    </div>
    <div class="form-row">
      <label>Tags (comma-separated)</label>
      <input type="text" id="m-tags" class="input" placeholder="tag1, tag2" value="${(txn?.tags||[]).join(", ")}" />
    </div>
    <div class="form-row">
      <label class="form-row-inline" style="flex-direction:row;align-items:center;gap:var(--sp-sm)">
        <span>Tax Deductible</span>
        <label class="toggle">
          <input type="checkbox" id="m-taxded" ${txn?.taxDeductible?"checked":""} />
          <span class="toggle-slider"></span>
        </label>
      </label>
    </div>`;

  const footer = `
    ${isEdit ? `<button class="btn btn-danger btn-sm" id="m-delete">Delete</button>` : ""}
    <button class="btn btn-ghost" id="m-cancel">Cancel</button>
    <button class="btn btn-primary" id="m-save">${isEdit ? "Update" : "Add"}</button>`;

  openModal(isEdit ? "Edit Transaction" : "Add Transaction", body, footer);

  document.getElementById("m-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("m-delete").onclick = () => confirmDelete(txn.id);
  document.getElementById("m-save").onclick = () => saveTxn(txn?.id);
};

const saveTxn = async (editId) => {
  const data = {
    date:          document.getElementById("m-date").value,
    amount:        parseFloat(document.getElementById("m-amount").value) || 0,
    currency:      document.getElementById("m-currency").value,
    type:          document.getElementById("m-type").value,
    accountId:     document.getElementById("m-account").value,
    categoryId:    document.getElementById("m-category").value,
    title:         document.getElementById("m-title").value.trim(),
    notes:         document.getElementById("m-notes").value.trim(),
    tags:          document.getElementById("m-tags").value.split(",").map(t=>t.trim()).filter(Boolean),
    taxDeductible: document.getElementById("m-taxded").checked,
    amountINR:     convertCurrency(parseFloat(document.getElementById("m-amount").value)||0, document.getElementById("m-currency").value, "INR"),
  };

  try {
    if (editId) {
      await updateTransaction(editId, data);
      toast("Transaction updated", "success");
    } else {
      await addTransaction(data);
      toast("Transaction added", "success");
    }
    closeModal();
    _page = 1;
    loadTransactions();
    window.dispatchEvent(new Event("data:changed"));
  } catch (err) {
    toast("Error saving transaction", "error");
    console.error(err);
  }
};

const confirmDelete = async (id) => {
  if (!confirm("Delete this transaction?")) return;
  await deleteTransaction(id);
  toast("Transaction deleted");
  closeModal();
  loadTransactions();
  window.dispatchEvent(new Event("data:changed"));
};

// ─── FILTERS ─────────────────────────────────────────────────
const bindFilterEvents = () => {
  const applyFilters = () => {
    const from    = document.getElementById("txn-filter-from")?.value;
    const to      = document.getElementById("txn-filter-to")?.value;
    const type    = document.getElementById("txn-filter-type")?.value;
    const account = document.getElementById("txn-filter-account")?.value;
    const search  = (document.getElementById("txn-search")?.value||"").toLowerCase();

    let filtered = _transactions;
    if (from) filtered = filtered.filter(t => t.date >= from);
    if (to)   filtered = filtered.filter(t => t.date <= to);
    if (type) filtered = filtered.filter(t => t.type === type);
    if (account) filtered = filtered.filter(t => t.accountId === account);
    if (search) filtered = filtered.filter(t =>
      (t.title||"").toLowerCase().includes(search) ||
      (t.notes||"").toLowerCase().includes(search)
    );

    _page = 1;
    renderTransactionList(filtered);
  };

  ["txn-filter-from","txn-filter-to","txn-filter-type","txn-filter-account","txn-search"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", applyFilters);
    document.getElementById(id)?.addEventListener("change", applyFilters);
  });
};

const populateAccountFilter = () => {
  const sel = document.getElementById("txn-filter-account");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">All Accounts</option>` +
    _accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join("");
  sel.value = cur;
};

// ─── SUMMARY STATS ────────────────────────────────────────────
export const calcCashFlow = (txns, from, to) => {
  const filtered = txns.filter(t => (!from || t.date >= from) && (!to || t.date <= to));
  const income   = filtered.filter(t=>t.type==="income").reduce((s,t)=>s+(t.amountINR||t.amount||0),0);
  const expense  = filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+(t.amountINR||t.amount||0),0);
  return { income, expense, net: income - expense };
};
