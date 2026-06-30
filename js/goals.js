// ============================================================
// js/goals.js – Financial Goals
// ============================================================
import { saveGoal, getGoals, deleteGoal } from "./database.js";
import { formatCurrency, todayISO, toast, openModal, closeModal, pct } from "./utils.js";

let _goals = [];

const GOAL_TYPES = {
  "Emergency Fund": "🆘", "Retirement": "🏖️", "House": "🏠", "Car": "🚗",
  "Vacation": "✈️", "Education": "🎓", "Wedding": "💍", "Custom": "🎯"
};

export const initGoals = async () => {
  _goals = await getGoals();
  renderGoalsGrid();
  document.getElementById("btn-add-goal-page")?.addEventListener("click", () => openGoalModal());
};

export const getGoalsData = () => _goals;

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
          <div class="goal-current">${formatCurrency(g.currentAmount||0, "INR", true)}</div>
          <div class="goal-target">of ${formatCurrency(g.targetAmount||0, "INR", true)}</div>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${Math.min(100,progress)}%"></div></div>
        <div class="goal-meta">
          <span>${progress.toFixed(0)}% complete</span>
          <span>${monthsLeft>0?monthsLeft+' months left':'Due'}</span>
        </div>
        ${monthlyReq > 0 ? `<div class="muted" style="font-size:0.78rem;margin-top:6px">Required SIP: ${formatCurrency(monthlyReq, "INR", true)}/mo</div>` : ""}
        <div class="goal-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${g.id}">Edit</button>
          <button class="btn btn-outline btn-sm" data-contribute="${g.id}">Add Funds</button>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openGoalModal(_goals.find(g=>g.id===b.dataset.edit)));
  grid.querySelectorAll("[data-contribute]").forEach(b=>b.onclick=()=>openContributeModal(_goals.find(g=>g.id===b.dataset.contribute)));
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
      <div class="form-row"><label>Target Amount (₹)</label><input type="number" id="g-target" class="input" value="${goal?.targetAmount||""}" /></div>
      <div class="form-row"><label>Current Amount (₹)</label><input type="number" id="g-current" class="input" value="${goal?.currentAmount||0}" /></div>
    </div>
    <div class="form-row"><label>Target Date</label><input type="date" id="g-date" class="input" value="${goal?.targetDate||""}" /></div>`;
  const footer = `${isEdit?`<button class="btn btn-danger btn-sm" id="g-delete">Delete</button>`:""}
    <button class="btn btn-ghost" id="g-cancel">Cancel</button>
    <button class="btn btn-primary" id="g-save">${isEdit?"Update":"Add"}</button>`;
  openModal(isEdit?"Edit Goal":"Add Goal", body, footer);

  document.getElementById("g-cancel").onclick = closeModal;
  if (isEdit) document.getElementById("g-delete").onclick = async () => {
    if (!confirm("Delete this goal?")) return;
    await deleteGoal(goal.id);
    toast("Goal deleted");
    closeModal();
    _goals = await getGoals();
    renderGoalsGrid();
  };
  document.getElementById("g-save").onclick = async () => {
    const data = {
      type: document.getElementById("g-type").value,
      name: document.getElementById("g-name").value.trim(),
      targetAmount: parseFloat(document.getElementById("g-target").value)||0,
      currentAmount: parseFloat(document.getElementById("g-current").value)||0,
      targetDate: document.getElementById("g-date").value,
    };
    await saveGoal(goal?.id||null, data);
    toast(isEdit?"Goal updated":"Goal added","success");
    closeModal();
    _goals = await getGoals();
    renderGoalsGrid();
    window.dispatchEvent(new Event("data:changed"));
  };
};

const openContributeModal = (goal) => {
  const body = `
    <div class="form-row"><label>Add Amount (₹)</label><input type="number" id="c-amount" class="input" placeholder="0" /></div>
    <p class="muted" style="font-size:0.82rem">Current: ${formatCurrency(goal.currentAmount||0)} / ${formatCurrency(goal.targetAmount)}</p>`;
  const footer = `<button class="btn btn-ghost" id="c-cancel">Cancel</button><button class="btn btn-primary" id="c-save">Add</button>`;
  openModal("Add Funds to " + goal.name, body, footer);
  document.getElementById("c-cancel").onclick = closeModal;
  document.getElementById("c-save").onclick = async () => {
    const amt = parseFloat(document.getElementById("c-amount").value)||0;
    await saveGoal(goal.id, { currentAmount: (goal.currentAmount||0) + amt });
    toast("Funds added to goal","success");
    closeModal();
    _goals = await getGoals();
    renderGoalsGrid();
    window.dispatchEvent(new Event("data:changed"));
  };
};
