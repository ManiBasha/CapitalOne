// ============================================================
// js/money.js – Accounts, Categories, Budgets, Insights
// ============================================================
import {
  saveAccount, getAccounts, deleteAccount,
  saveCategory, getCategories, deleteCategory,
  saveBudget, getBudgets, deleteBudget
} from "./database.js";
import { formatCurrency, toast, openModal, closeModal, pct, DEFAULT_CATEGORIES, monthStart, todayISO } from "./utils.js";
import { loadTransactions, calcCashFlow } from "./transactions.js";
import { renderCashFlowChart } from "./charts.js";

let _accounts = [], _categories = [], _budgets = [], _transactions = [];

export const initMoney = async () => {
  _accounts   = await getAccounts();
  _categories = await getCategories();
  _budgets    = await getBudgets();

  // Seed default categories if empty
  if (_categories.length === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      await saveCategory(null, c);
    }
    _categories = await getCategories();
  }

  bindTabEvents();
  bindActionButtons();
  await refreshMoneyPage();
};

export const getAccountsData = () => _accounts;
export const getCategoriesData = () => _categories;

export const refreshMoneyPage = async () => {
  _transactions = await loadTransactions();
  renderMoneyCards();
  renderAccountsGrid();
  renderBudgets();
  renderCategoriesGrid();
}

const renderMoneyCards = () => {
  const from = monthStart(0);
  const to   = todayISO();
  const { income, expense } = calcCashFlow(_transactions, from, to);
  const savingsRate = income > 0 ? pct(income - expense, income) : 0;
  const accountsBal  = _accounts.reduce((s,a)=>s+(a.balance||0),0);

  document.getElementById("money-income").textContent = formatCurrency(income, "INR", true);
  document.getElementById("money-expense").textContent = formatCurrency(expense, "INR", true);
  document.getElementById("money-savings-rate").textContent = savingsRate.toFixed(1) + "%";
  document.getElementById("money-accounts-bal").textContent = formatCurrency(accountsBal, "INR", true);
};

// ─── TABS ────────────────────────────────────────────────────
const bindTabEvents = () => {
  document.querySelectorAll("#money-tabs .tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#money-tabs .tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll("#money-tabs ~ .tab-content, .tab-content").forEach(c=>{});
      tab.classList.add("active");

      document.querySelectorAll("[id^='tab-']").forEach(el => el.classList.remove("active"));
      document.querySelectorAll("[id^='tab-']").forEach(el => el.classList.add("hidden"));
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      target.classList.remove("hidden");
      target.classList.add("active");
    });
  });
};

const bindActionButtons = () => {
  document.getElementById("btn-add-account")?.addEventListener("click", () => openAccountModal());
  document.getElementById("btn-add-budget")?.addEventListener("click", () => openBudgetModal());
  document.getElementById("btn-add-category")?.addEventListener("click", () => openCategoryModal());
};

// ─── ACCOUNTS ────────────────────────────────────────────────
const ACCOUNT_TYPES = ["Cash","Bank","Wallet","Credit Card","Investment","Loan"];
const ACCOUNT_ICONS = { Cash:"💵", Bank:"🏦", Wallet:"👛", "Credit Card":"💳", Investment:"📈", Loan:"🏛️" };

const renderAccountsGrid = () => {
  const grid = document.getElementById("accounts-grid");
  if (!grid) return;
  if (_accounts.length === 0) {
    grid.innerHTML = `<div class="empty-state"><i data-lucide="wallet"></i><p>No accounts yet. Add your first account.</p></div>`;
    lucide.createIcons();
    return;
  }
  grid.innerHTML = _accounts.map(a => `
    <div class="account-card" data-id="${a.id}">
      <div class="account-icon" style="background:${a.color||'#5a6e3a'}22;color:${a.color||'#5a6e3a'}">${ACCOUNT_ICONS[a.type]||'💼'}</div>
      <div class="account-name">${a.name}</div>
      <div class="account-bal">${formatCurrency(a.balance||0, a.currency||"INR")}</div>
      <div class="account-type">${a.type} · ${a.institution||""}</div>
    </div>`).join("");

  grid.querySelectorAll(".account-card").forEach(card =>
    card.addEventListener("click", () => openAccountModal(_accounts.find(a=>a.id===card.dataset.id)))
  );
};

const openAccountModal = (account) => {
  const isEdit = !!account;
  const body = `
    <div class="form-row"><label>Account Name</label><input id="acc-name" class="input" value="${account?.name||""}" placeholder="e.g. HDFC Savings" /></div>
    <div class="form-row"><label>Type</label>
      <select id="acc-type" class="input">${ACCOUNT_TYPES.map(t=>`<option ${account?.type===t?"selected":""}>${t}</option>`).join("")}</select>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Opening Balance</label><input type="number" id="acc-balance" class="input" value="${account?.balance||""}" /></div>
      <div class="form-row"><label>Currency</label>
        <select id="acc-currency" class="input">${["INR","SAR","USD"].map(c=>`<option ${account?.currency===c?"selected":""}>${c}</option>`).join("")}</select>
      </div>
    </div>
    <div class="form-row"><label>Institution</label><input id="acc-institution" class="input" value="${account?.institution||""}" placeholder="e.g. HDFC Bank" /></div>
    <div class="form-row"><label>Color</label><input type="color" id="acc-color" class="input" value="${account?.color||"#5a6e3a"}" style="height:42px" /></div>
    <div class="form-row"><label>Notes</label><input id="acc-notes" class="input" value="${account?.notes||""}" /></div>`;
  const footer = `${isEdit?`<button class="btn btn-danger btn-sm" id="acc-delete">Delete</button>`:""}
    <button class="btn btn-ghost" id="acc-cancel">Cancel</button>
    <button class="btn btn-primary" id="acc-save">${isEdit?"Update":"Add"}</button>`;
  openModal(isEdit?"Edit Account":"Add Account", body, footer);

  document.getElementById("acc-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("acc-delete").onclick = async () => {
    if (!confirm("Delete this account?")) return;
    await deleteAccount(account.id);
    toast("Account deleted");
    closeModal();
    _accounts = await getAccounts();
    renderAccountsGrid();
    window.dispatchEvent(new Event("data:changed"));
  };
  document.getElementById("acc-save").onclick = async () => {
    const data = {
      name: document.getElementById("acc-name").value.trim(),
      type: document.getElementById("acc-type").value,
      balance: parseFloat(document.getElementById("acc-balance").value)||0,
      currency: document.getElementById("acc-currency").value,
      institution: document.getElementById("acc-institution").value.trim(),
      color: document.getElementById("acc-color").value,
      notes: document.getElementById("acc-notes").value.trim(),
    };
    await saveAccount(account?.id||null, data);
    toast(isEdit?"Account updated":"Account added","success");
    closeModal();
    _accounts = await getAccounts();
    renderAccountsGrid();
    renderMoneyCards();
    window.dispatchEvent(new Event("data:changed"));
  };
};

// ─── CATEGORIES ──────────────────────────────────────────────
const renderCategoriesGrid = () => {
  const grid = document.getElementById("categories-grid");
  if (!grid) return;
  grid.innerHTML = _categories.map(c => `
    <div class="category-card" data-id="${c.id}">
      <div class="category-emoji">${c.emoji||"📌"}</div>
      <div class="category-name">${c.name}</div>
    </div>`).join("");
  grid.querySelectorAll(".category-card").forEach(card =>
    card.addEventListener("click", () => openCategoryModal(_categories.find(c=>c.id===card.dataset.id)))
  );
};

const openCategoryModal = (category) => {
  const isEdit = !!category;
  const body = `
    <div class="form-row"><label>Category Name</label><input id="cat-name" class="input" value="${category?.name||""}" /></div>
    <div class="form-row"><label>Emoji Icon</label><input id="cat-emoji" class="input" value="${category?.emoji||"📌"}" maxlength="2" /></div>
    <div class="form-row"><label>Color</label><input type="color" id="cat-color" class="input" value="${category?.color||"#5a6e3a"}" style="height:42px" /></div>`;
  const footer = `${isEdit?`<button class="btn btn-danger btn-sm" id="cat-delete">Delete</button>`:""}
    <button class="btn btn-ghost" id="cat-cancel">Cancel</button>
    <button class="btn btn-primary" id="cat-save">${isEdit?"Update":"Add"}</button>`;
  openModal(isEdit?"Edit Category":"Add Category", body, footer);

  document.getElementById("cat-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("cat-delete").onclick = async () => {
    if (!confirm("Delete this category?")) return;
    await deleteCategory(category.id);
    toast("Category deleted");
    closeModal();
    _categories = await getCategories();
    renderCategoriesGrid();
  };
  document.getElementById("cat-save").onclick = async () => {
    const data = {
      name: document.getElementById("cat-name").value.trim(),
      emoji: document.getElementById("cat-emoji").value.trim(),
      color: document.getElementById("cat-color").value,
    };
    await saveCategory(category?.id||null, data);
    toast(isEdit?"Category updated":"Category added","success");
    closeModal();
    _categories = await getCategories();
    renderCategoriesGrid();
  };
};

// ─── BUDGETS ─────────────────────────────────────────────────
const renderBudgets = () => {
  const list = document.getElementById("budgets-list");
  if (!list) return;
  if (_budgets.length === 0) {
    list.innerHTML = `<div class="empty-state"><i data-lucide="pie-chart"></i><p>No budgets set. Create one to track spending.</p></div>`;
    lucide.createIcons();
    return;
  }
  list.innerHTML = _budgets.map(b => {
    const spent = _transactions
      .filter(t => t.type==="expense" && t.categoryId===b.categoryId)
      .reduce((s,t)=>s+(t.amountINR||t.amount||0),0);
    const percent = Math.min(100, pct(spent, b.amount));
    const cls = percent >= 100 ? "danger" : percent >= 80 ? "warning" : "";
    const cat = _categories.find(c=>c.id===b.categoryId);
    return `
      <div class="budget-item" data-id="${b.id}">
        <div class="budget-header">
          <span class="budget-name">${cat?.emoji||"📌"} ${cat?.name||b.name||"Budget"}</span>
          <span class="budget-amounts">${formatCurrency(spent)} / ${formatCurrency(b.amount)}</span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar ${cls}" style="width:${percent}%"></div></div>
      </div>`;
  }).join("");

  list.querySelectorAll(".budget-item").forEach(item =>
    item.addEventListener("click", () => openBudgetModal(_budgets.find(b=>b.id===item.dataset.id)))
  );
};

const openBudgetModal = (budget) => {
  const isEdit = !!budget;
  const body = `
    <div class="form-row"><label>Category</label>
      <select id="bud-category" class="input">
        ${_categories.map(c=>`<option value="${c.id}" ${budget?.categoryId===c.id?"selected":""}>${c.emoji} ${c.name}</option>`).join("")}
      </select>
    </div>
    <div class="form-row"><label>Budget Amount (₹)</label><input type="number" id="bud-amount" class="input" value="${budget?.amount||""}" /></div>
    <div class="form-row"><label>Period</label>
      <select id="bud-period" class="input">
        <option value="monthly" ${budget?.period==="monthly"?"selected":""}>Monthly</option>
        <option value="yearly" ${budget?.period==="yearly"?"selected":""}>Yearly</option>
        <option value="custom" ${budget?.period==="custom"?"selected":""}>Custom</option>
      </select>
    </div>`;
  const footer = `${isEdit?`<button class="btn btn-danger btn-sm" id="bud-delete">Delete</button>`:""}
    <button class="btn btn-ghost" id="bud-cancel">Cancel</button>
    <button class="btn btn-primary" id="bud-save">${isEdit?"Update":"Add"}</button>`;
  openModal(isEdit?"Edit Budget":"Add Budget", body, footer);

  document.getElementById("bud-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("bud-delete").onclick = async () => {
    if (!confirm("Delete this budget?")) return;
    await deleteBudget(budget.id);
    toast("Budget deleted");
    closeModal();
    _budgets = await getBudgets();
    renderBudgets();
  };
  document.getElementById("bud-save").onclick = async () => {
    const data = {
      categoryId: document.getElementById("bud-category").value,
      amount: parseFloat(document.getElementById("bud-amount").value)||0,
      period: document.getElementById("bud-period").value,
    };
    await saveBudget(budget?.id||null, data);
    toast(isEdit?"Budget updated":"Budget added","success");
    closeModal();
    _budgets = await getBudgets();
    renderBudgets();
  };
};

// ─── INSIGHTS ────────────────────────────────────────────────
export const generateInsights = (txns) => {
  const insights = [];
  const from = monthStart(0);
  const monthTxns = txns.filter(t => t.date >= from);

  const expenseByCategory = {};
  monthTxns.filter(t=>t.type==="expense").forEach(t => {
    expenseByCategory[t.categoryId] = (expenseByCategory[t.categoryId]||0) + (t.amountINR||t.amount||0);
  });
  const topCategory = Object.entries(expenseByCategory).sort((a,b)=>b[1]-a[1])[0];
  if (topCategory) {
    const cat = _categories.find(c=>c.id===topCategory[0]);
    insights.push(`Highest spending: ${cat?.name||"Unknown"} (${formatCurrency(topCategory[1])})`);
  }

  const { income, expense } = calcCashFlow(txns, from, todayISO());
  if (income > 0) insights.push(`Savings rate this month: ${pct(income-expense, income).toFixed(1)}%`);

  return insights;
};
