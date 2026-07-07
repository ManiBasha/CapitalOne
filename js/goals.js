// ============================================================
// js/goals.js – Financial Goals + Contribution History
// ============================================================
import { saveGoal, getGoals, deleteGoal, addGoalContribution, getGoalContributions, updateGoalContribution, deleteGoalContribution } from "./database.js?v=20260707a";
import { formatCurrency, formatDate, todayISO, toast, openModal, closeModal, pct } from "./utils.js?v=20260707a";

let _goals = [];
let _allContributions = {}; // { goalId: [contribution, ...] }

const GOAL_TYPES = {
  "Emergency Fund": "🆘", "Retirement": "🏖️", "House": "🏠", "Car": "🚗",
  "Vacation": "✈️", "Education": "🎓", "Wedding": "💍", "Custom": "🎯"
};

export const initGoals = async () => {
  _goals = await getGoals();
  await reloadContributions();
  renderGoalsGrid();
  document.getElementById("btn-add-goal-page")?.addEventListener("click", () => openGoalModal());
};

const reloadContributions = async () => {
  const results = await Promise.all(_goals.map(async g => ({ id: g.id, contributions: await getGoalContributions(g.id) })));
  _allContributions = {};
  results.forEach(r => { _allContributions[r.id] = r.contributions; });
};

export const getGoalsData = () => _goals;

// Recompute currentAmount from the contribution ledger (source of truth),
// so add/edit/delete of individual contributions always keeps the total
// accurate — never just overwritten by hand.
const recalcGoalTotal = async (goalId) => {
  const contributions = await getGoalContributions(goalId);
  _allContributions[goalId] = contributions;
  const total = contributions.reduce((s, c) => s + (c.amount || 0), 0);
  await saveGoal(goalId, { currentAmount: total });
  const goal = _goals.find(g => g.id === goalId);
  if (goal) goal.currentAmount = total;
};

const renderGoalsGrid = () => {
  const grid = document.getElementById("goals-grid");
  if (!grid) return;
  if (_goals.length === 0) {
    grid.innerHTML = `<div class="empty-state"><i data-lucide="target"></i><p>No goals yet. Set your first financial goal!</p></div>`;
    lucide.createIcons();
    return;
  }
  grid.innerHTML = _goals.map(g => {
    const progress = pct(g.currentAmount||0, g.targetAmount||1);
    const monthsLeft = monthsUntil(g.targetDate);
    const monthlyReq = monthsLeft > 0 ? Math.max(0, (g.targetAmount - (g.currentAmount||0)) / monthsLeft) : 0;
    const contribCount = (_allContributions[g.id] || []).length;
    return `
      <div class="goal-card" data-id="${g.id}">
        <div class="goal-header">
          <span class="goal-emoji">${GOAL_TYPES[g.type]||"🎯"}</span>
          <div>
            <div class="goal-name">${g.name}</div>
            <div class="goal-type">${g.type}</div>
          </div>
        </div>
        <div class="goal-amounts">
          <div class="goal-current">${formatCurrency(g.currentAmount||0, g.currency||"INR", true)}</div>
          <div class="goal-target">of ${formatCurrency(g.targetAmount||0, g.currency||"INR", true)}</div>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${Math.min(100,progress)}%"></div></div>
        <div class="goal-meta">
          <span>${progress.toFixed(0)}% complete</span>
          <span>${monthsLeft>0?monthsLeft+' months left':'Due'}</span>
        </div>
        ${monthlyReq > 0 ? `<div class="muted" style="font-size:0.78rem;margin-top:6px">Required SIP: ${formatCurrency(monthlyReq, g.currency||"INR", true)}/mo</div>` : ""}
        <div class="goal-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${g.id}">Edit</button>
          <button class="btn btn-outline btn-sm" data-contribute="${g.id}">Add Funds</button>
          <button class="btn btn-ghost btn-sm" data-history="${g.id}">History${contribCount ? ` (${contribCount})` : ""}</button>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openGoalModal(_goals.find(g=>g.id===b.dataset.edit)));
  grid.querySelectorAll("[data-contribute]").forEach(b=>b.onclick=()=>openContributeModal(_goals.find(g=>g.id===b.dataset.contribute)));
  grid.querySelectorAll("[data-history]").forEach(b=>b.onclick=()=>openContributionHistoryModal(_goals.find(g=>g.id===b.dataset.history)));
};

const monthsUntil = (dateStr) => {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(0, (target.getFullYear()-now.getFullYear())*12 + (target.getMonth()-now.getMonth()));
};

export const openGoalModal = (goal) => {
  const isEdit = !!goal;
  const body = `
    <div class="form-row"><label>Goal Type</label>
      <select id="g-type" class="input">${Object.keys(GOAL_TYPES).map(t=>`<option ${goal?.type===t?"selected":""}>${t}</option>`).join("")}</select>
    </div>
    <div class="form-row"><label>Goal Name</label><input id="g-name" class="input" value="${goal?.name||""}" placeholder="e.g. Dream Home" /></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Target Amount</label><input type="number" id="g-target" class="input" value="${goal?.targetAmount||""}" /></div>
      <div class="form-row"><label>Current Amount</label><input type="number" id="g-current" class="input" value="${goal?.currentAmount||0}" disabled /></div>
    </div>
    ${isEdit ? `<div class="muted" style="font-size:0.7rem;margin:-8px 0 8px">Current Amount is derived from Contribution History — use "Add Funds" or edit the History to change it.</div>` : ""}
    <div class="form-row"><label>Currency</label>
      <select id="g-currency" class="input">${["INR","SAR","USD","AED","GBP","EUR"].map(c=>`<option ${goal?.currency===c?"selected":""}>${c}</option>`).join("")}</select>
    </div>
    <div class="form-row"><label>Target Date</label><input type="date" id="g-date" class="input" value="${goal?.targetDate||""}" /></div>`;
  const footer = `${isEdit?`<button class="btn btn-danger btn-sm" id="g-delete">Delete</button>`:""}
    <button class="btn btn-ghost" id="g-cancel">Cancel</button>
    <button class="btn btn-primary" id="g-save">${isEdit?"Update":"Add"}</button>`;
  openModal(isEdit?"Edit Goal":"Add Goal", body, footer);

  document.getElementById("g-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("g-delete").onclick = async () => {
    if (!confirm("Delete this goal and its contribution history?")) return;
    await deleteGoal(goal.id);
    toast("Goal deleted");
    closeModal();
    _goals = await getGoals();
    delete _allContributions[goal.id];
    renderGoalsGrid();
    window.dispatchEvent(new Event("data:changed"));
  };
  document.getElementById("g-save").onclick = async () => {
    const data = {
      type: document.getElementById("g-type").value,
      name: document.getElementById("g-name").value.trim(),
      targetAmount: parseFloat(document.getElementById("g-target").value)||0,
      currency: document.getElementById("g-currency").value,
      targetDate: document.getElementById("g-date").value,
    };
    if (!isEdit) data.currentAmount = 0; // new goals start at 0; funded via contributions
    const newId = await saveGoal(goal?.id||null, data);
    toast(isEdit?"Goal updated":"Goal added","success");
    closeModal();
    _goals = await getGoals();
    await reloadContributions();
    renderGoalsGrid();
    window.dispatchEvent(new Event("data:changed"));
  };
};

// ─── ADD FUNDS (records a dated, editable contribution — not just an overwrite) ──
const openContributeModal = (goal) => {
  const body = `
    <div class="form-row"><label>Amount (${goal.currency||"INR"})</label><input type="number" id="c-amount" class="input" placeholder="0" /></div>
    <div class="form-row"><label>Date</label><input type="date" id="c-date" class="input" value="${todayISO()}" /></div>
    <div class="form-row"><label>Notes (optional)</label><input type="text" id="c-notes" class="input" placeholder="e.g. Monthly SIP, Bonus" /></div>
    <p class="muted" style="font-size:0.82rem">Current: ${formatCurrency(goal.currentAmount||0, goal.currency||"INR")} / ${formatCurrency(goal.targetAmount, goal.currency||"INR")}</p>
    <p class="muted" style="font-size:0.72rem">Enter a negative amount to record a withdrawal.</p>`;
  const footer = `<button class="btn btn-ghost" id="c-cancel">Cancel</button><button class="btn btn-primary" id="c-save">Add</button>`;
  openModal("Add Funds to " + goal.name, body, footer);
  document.getElementById("c-cancel").onclick = closeModal;
  document.getElementById("c-save").onclick = async () => {
    const amt = parseFloat(document.getElementById("c-amount").value)||0;
    const date = document.getElementById("c-date").value;
    const notes = document.getElementById("c-notes").value.trim();
    if (amt === 0) { toast("Enter a non-zero amount", "error"); return; }

    await addGoalContribution(goal.id, { amount: amt, date, notes });
    await recalcGoalTotal(goal.id);

    toast("Funds added to goal","success");
    closeModal();
    _goals = await getGoals();
    renderGoalsGrid();
    window.dispatchEvent(new Event("data:changed"));
  };
};

// This is called by investments.js when a purchase is optionally linked to
// a goal — records the contribution the same way "Add Funds" does.
export const contributeToGoalFromPurchase = async (goalId, amount, date, notes) => {
  await addGoalContribution(goalId, { amount, date, notes });
  await recalcGoalTotal(goalId);
  window.dispatchEvent(new Event("data:changed"));
};

// ─── CONTRIBUTION HISTORY (add/edit/delete individual entries) ──
const openContributionHistoryModal = (goal) => {
  if (!goal) return;
  const contributions = (_allContributions[goal.id] || []).slice().sort((a,b) => (a.date||"").localeCompare(b.date||""));

  const renderRows = () => contributions.map(c => `
    <tr data-cid="${c.id}">
      <td>${formatDate(c.date)}</td>
      <td class="${c.amount>=0?"positive":"negative"}">${c.amount>=0?"+":""}${formatCurrency(c.amount, goal.currency||"INR")}</td>
      <td>${c.notes||"—"}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-edit-contrib="${c.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-del-contrib="${c.id}">×</button>
      </td>
    </tr>`).join("");

  const body = `
    <div class="muted" style="font-size:0.85rem;margin-bottom:var(--sp-md)">
      <strong>${goal.name}</strong> · Total: ${formatCurrency(goal.currentAmount||0, goal.currency||"INR")} of ${formatCurrency(goal.targetAmount, goal.currency||"INR")}
    </div>
    <div class="inv-table-wrap" style="max-height:340px;overflow-y:auto">
      <table class="inv-table" id="contrib-history-table">
        <thead><tr><th>Date</th><th>Amount</th><th>Notes</th><th></th></tr></thead>
        <tbody>${contributions.length ? renderRows() : `<tr><td colspan="4" class="muted" style="text-align:center;padding:1rem">No contributions recorded yet</td></tr>`}</tbody>
      </table>
    </div>`;
  const footer = `<button class="btn btn-ghost" id="hist-close">Close</button>`;
  openModal(`Contribution History — ${goal.name}`, body, footer);
  document.getElementById("hist-close").onclick = closeModal;

  const bindRowActions = () => {
    document.querySelectorAll("[data-del-contrib]").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Delete this contribution?")) return;
        await deleteGoalContribution(goal.id, btn.dataset.delContrib);
        await recalcGoalTotal(goal.id);
        toast("Contribution deleted");
        closeModal();
        _goals = await getGoals();
        renderGoalsGrid();
        window.dispatchEvent(new Event("data:changed"));
      };
    });
    document.querySelectorAll("[data-edit-contrib]").forEach(btn => {
      btn.onclick = () => openEditContributionModal(goal, contributions.find(c => c.id === btn.dataset.editContrib));
    });
  };
  bindRowActions();
};

const openEditContributionModal = (goal, contribution) => {
  const body = `
    <div class="form-row"><label>Amount (${goal.currency||"INR"})</label><input type="number" id="ec-amount" class="input" value="${contribution.amount}" /></div>
    <div class="form-row"><label>Date</label><input type="date" id="ec-date" class="input" value="${contribution.date||todayISO()}" /></div>
    <div class="form-row"><label>Notes</label><input type="text" id="ec-notes" class="input" value="${contribution.notes||""}" /></div>`;
  const footer = `<button class="btn btn-ghost" id="ec-cancel">Cancel</button><button class="btn btn-primary" id="ec-save">Save</button>`;
  openModal("Edit Contribution", body, footer);
  document.getElementById("ec-cancel").onclick = () => openContributionHistoryModal(goal);
  document.getElementById("ec-save").onclick = async () => {
    const amount = parseFloat(document.getElementById("ec-amount").value) || 0;
    const date = document.getElementById("ec-date").value;
    const notes = document.getElementById("ec-notes").value.trim();
    await updateGoalContribution(goal.id, contribution.id, { amount, date, notes });
    await recalcGoalTotal(goal.id);
    toast("Contribution updated", "success");
    _goals = await getGoals();
    renderGoalsGrid();
    window.dispatchEvent(new Event("data:changed"));
    openContributionHistoryModal(_goals.find(g => g.id === goal.id));
  };
};
