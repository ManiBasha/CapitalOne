// ============================================================
// js/dashboard.js – Personal Wealth & Investment Dashboard home page
// ============================================================
import { getInvestmentsData, getAllSells, getAllBuys, aggregateInvestments, getPortfolioCostBasisTimeline, openInvModal } from "./investments.js?v=20260707a";
import { getWealthData } from "./wealth.js?v=20260707a";
import { getGoalsData } from "./goals.js?v=20260707a";
import { formatCurrency, todayISO, ls, openModal, closeModal } from "./utils.js?v=20260707a";
import { renderQuickSummaryChart, renderPortfolioPerformanceChart } from "./charts.js?v=20260707a";
import { computeCapitalGainsSummary } from "./capitalgains.js?v=20260707a";

// ─── INVESTED-CAPITAL SERIES (from the actual first purchase date) ──
// We don't have historical market prices, so "Invested (cumulative)" is the
// one line we CAN plot accurately all the way back to day one — built from
// real buy-lot and sell dates. "Current Value" is layered on top from the
// daily snapshot mechanism below (only available from when the app started
// recording, growing forward).
const buildInvestedSeries = (investments, allBuys, allSells) => {
  const events = [];
  investments.forEach(inv => {
    (allBuys[inv.id] || []).forEach(b => {
      if (b.date) events.push({ date: b.date, amount: (b.quantity || 0) * (b.price || 0) });
    });
    (allSells[inv.id] || []).forEach(s => {
      if (s.sellDate) events.push({ date: s.sellDate, amount: -(s.quantity || 0) * (inv.avgPrice || 0) });
    });
  });
  if (events.length === 0) return [];
  events.sort((a, b) => a.date.localeCompare(b.date));

  const series = [];
  let cum = 0, idx = 0;
  const start = new Date(events[0].date);
  const end = new Date(todayISO());
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    while (idx < events.length && events[idx].date <= dateStr) { cum += events[idx].amount; idx++; }
    series.push({ date: dateStr, value: Math.max(0, cum) });
  }
  return series;
};

const filterSeriesByRange = (series, range) => {
  if (range === "All" || series.length === 0) return series;
  const days = { Today: 1, "1W": 7, "1M": 30, "3M": 90, "6M": 182, "1Y": 365, "3Y": 1095 }[range] ?? 9999;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return series.filter(p => new Date(p.date) >= cutoff);
};

// ─── OPEN QUANTITY HELPER (mirrors investments.js logic) ──────
const openQty = (inv, allSells) => {
  const sells = allSells[inv.id] || [];
  const soldQty = sells.reduce((s, sell) => s + sell.quantity, 0);
  return Math.max(0, (inv.quantity || 0) - soldQty);
};

// ─── XIRR (Newton-Raphson) ─────────────────────────────────────
// cashflows: [{ date: Date, amount: number }]  (negative = money out, positive = money in)
const xirr = (cashflows, guess = 0.1) => {
  if (cashflows.length < 2) return null;
  const t0 = cashflows[0].date.getTime();
  const years = (d) => (d.getTime() - t0) / (365 * 24 * 3600 * 1000);

  const npv = (rate) => cashflows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, years(cf.date)), 0);
  const dnpv = (rate) => cashflows.reduce((sum, cf) => {
    const y = years(cf.date);
    return y === 0 ? sum : sum - (y * cf.amount) / Math.pow(1 + rate, y + 1);
  }, 0);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-6) { rate = next; break; }
    rate = next;
  }
  return isFinite(rate) ? rate * 100 : null;
};

const buildCashflows = (investments, allSells) => {
  const flows = [];
  investments.forEach(inv => {
    if (inv.purchaseDate) flows.push({ date: new Date(inv.purchaseDate), amount: -(inv.avgPrice * inv.quantity || 0) });
    (allSells[inv.id] || []).forEach(sell => {
      if (sell.sellDate) flows.push({ date: new Date(sell.sellDate), amount: sell.sellPrice * sell.quantity });
    });
  });
  const currentValue = investments.reduce((s, inv) => s + (inv.currentPrice || inv.avgPrice) * openQty(inv, allSells), 0);
  if (currentValue > 0) flows.push({ date: new Date(todayISO()), amount: currentValue });
  return flows.sort((a, b) => a.date - b.date);
};

// ─── DAILY SNAPSHOT (for Today's Change + Performance chart) ──
// Stored locally as a running history: { "YYYY-MM-DD": totalValue }.
// Populates gradually as the app is used day-to-day since we don't have
// historical market prices to backfill.
const SNAPSHOT_KEY = "portfolio_snapshots";
let _lastHealthBreakdown = [];
const recordSnapshot = (value) => {
  const snaps = ls.get(SNAPSHOT_KEY, {});
  snaps[todayISO()] = value;
  ls.set(SNAPSHOT_KEY, snaps);
  return snaps;
};

const todaysChange = (snaps, currentValue) => {
  const dates = Object.keys(snaps).sort();
  const prevDate = dates.filter(d => d !== todayISO()).pop();
  if (!prevDate) return null;
  return currentValue - snaps[prevDate];
};

// ─── QUICK SUMMARY BREAKDOWN ───────────────────────────────────
const computeQuickSummary = (investments, allSells, assets, liabilities) => {
  const byType = (types) => investments
    .filter(i => types.includes(i.assetType))
    .reduce((s, i) => s + (i.currentPrice || i.avgPrice) * openQty(i, allSells), 0);

  const assetByCat = (cats) => assets
    .filter(a => cats.includes(a.category))
    .reduce((s, a) => s + (a.currentValue || a.value || 0), 0);

  return {
    "Equity":         byType(["Equity"]),
    "Mutual Funds":   byType(["Mutual Fund"]),
    "Commodity":      byType(["Commodity"]) + assetByCat(["Gold/Jewelry"]),
    "FD":             byType(["FD"]),
    "Emergency Fund": assetByCat(["Emergency Fund"]),
    "Cash":           assetByCat(["Cash", "Bank Deposit"]),
    "Other Assets":   assetByCat(["Real Estate", "Vehicle", "Provident Fund (EPF/PPF)", "Insurance (Cash Value)", "Other"]),
    "Liabilities":    -liabilities.reduce((s, l) => s + (l.outstanding || 0), 0),
  };
};

// ─── PORTFOLIO HEALTH SCORE (0-100, simple heuristic) ──────────
// ─── PORTFOLIO HEALTH SCORE (0-100) — with per-criterion breakdown ──
const computeHealthScore = (investments, quickSummary, goals) => {
  const criteria = [];
  const total = Object.entries(quickSummary).filter(([k]) => k !== "Liabilities").reduce((s, [,v]) => s + v, 0);

  // 1. Diversification across asset classes
  const buckets = Object.entries(quickSummary).filter(([k, v]) => k !== "Liabilities" && v > 0).length;
  const divPts = Math.min(buckets * 8, 32);
  criteria.push({
    label: "Diversification", points: divPts, max: 32,
    status: divPts >= 24 ? "good" : divPts >= 12 ? "ok" : "bad",
    detail: `Spread across ${buckets} asset ${buckets === 1 ? "class" : "classes"}.`,
    suggestion: divPts >= 24 ? "Good spread — keep it up." : "Consider spreading investments across more asset classes (Equity, Mutual Funds, FD, Commodity) to reduce risk."
  });

  // 2. Concentration — no single equity holding should dominate
  const equityInvs = investments.filter(i => i.assetType === "Equity");
  const equityTotal = equityInvs.reduce((s, i) => s + (i.currentPrice || i.avgPrice) * (i.quantity || 0), 0);
  const maxHolding = Math.max(0, ...equityInvs.map(i => (i.currentPrice || i.avgPrice) * (i.quantity || 0)));
  const concentration = equityTotal > 0 ? maxHolding / equityTotal : 0;
  const concPts = concentration < 0.25 ? 25 : concentration < 0.4 ? 15 : concentration < 0.6 ? 8 : 0;
  criteria.push({
    label: "Concentration Risk", points: concPts, max: 25,
    status: concPts >= 20 ? "good" : concPts >= 10 ? "ok" : "bad",
    detail: equityTotal > 0 ? `Largest single equity holding is ${(concentration*100).toFixed(0)}% of your equity book.` : "No equity holdings yet.",
    suggestion: concPts >= 20 ? "Well diversified within equity." : "One or two stocks make up too much of your equity — consider trimming and spreading into other names."
  });

  // 3. Emergency Fund / cash buffer
  const emergencyFund = quickSummary["Emergency Fund"] || 0;
  const cashRatio = total > 0 ? (emergencyFund + (quickSummary["Cash"] || 0)) / total : 0;
  const efPts = cashRatio >= 0.1 ? 18 : cashRatio >= 0.05 ? 10 : 4;
  criteria.push({
    label: "Emergency Fund / Cash Buffer", points: efPts, max: 18,
    status: efPts >= 15 ? "good" : efPts >= 8 ? "ok" : "bad",
    detail: `Emergency Fund + Cash is ${(cashRatio*100).toFixed(1)}% of your total wealth.`,
    suggestion: efPts >= 15 ? "Healthy buffer for emergencies." : "Build up a dedicated Emergency Fund (aim for 3-6 months of expenses) under Dashboard → Manage Assets."
  });

  // 4. Goal funding
  let goalPts;
  if (goals.length) {
    const avgProgress = goals.reduce((s, g) => s + Math.min(1, (g.currentAmount || 0) / (g.targetAmount || 1)), 0) / goals.length;
    goalPts = avgProgress * 15;
  } else {
    goalPts = 6;
  }
  criteria.push({
    label: "Goal Funding", points: goalPts, max: 15,
    status: goalPts >= 12 ? "good" : goalPts >= 6 ? "ok" : "bad",
    detail: goals.length ? `${goals.length} goal(s) tracked.` : "No goals set yet.",
    suggestion: goals.length ? (goalPts >= 12 ? "Goals are well funded." : "Increase contributions toward your goals to stay on track.") : "Set up a few financial goals (Retirement, House, etc.) to track progress against."
  });

  // 5. Leverage — liabilities vs total assets
  const liabRatio = total > 0 ? Math.abs(quickSummary["Liabilities"] || 0) / total : 0;
  const levPts = liabRatio < 0.2 ? 10 : liabRatio < 0.4 ? 5 : 0;
  criteria.push({
    label: "Leverage (Debt Load)", points: levPts, max: 10,
    status: levPts >= 8 ? "good" : levPts >= 4 ? "ok" : "bad",
    detail: `Liabilities are ${(liabRatio*100).toFixed(1)}% of your total wealth.`,
    suggestion: levPts >= 8 ? "Debt load is under control." : "Focus on paying down liabilities — high debt relative to assets increases financial risk."
  });

  const score = Math.round(Math.min(100, criteria.reduce((s, c) => s + c.points, 0)));
  return { score, criteria };
};

// ─── UPCOMING REMINDERS ─────────────────────────────────────────
const computeReminders = () => {
  const reminders = [];
  const today = new Date();

  // ITR filing — default FY-end 31 Mar, filing due 31 Jul, remind N days before (configurable)
  const itrDays = ls.get("itr_reminder_days", 60);
  const fyEndYear = today.getMonth() >= 3 ? today.getFullYear() + 1 : today.getFullYear();
  const itrDue = new Date(fyEndYear, 6, 31); // 31 July
  const daysToItr = Math.ceil((itrDue - today) / 86400000);
  if (daysToItr >= 0 && daysToItr <= itrDays) {
    reminders.push({ title: "ITR Filing", date: itrDue, note: `${daysToItr} days left` });
  }

  // Monthly portfolio review — configurable day-of-month
  const reviewDay = ls.get("review_reminder_day", 1);
  const nextReview = new Date(today.getFullYear(), today.getMonth() + (today.getDate() > reviewDay ? 1 : 0), reviewDay);
  reminders.push({ title: "Review Portfolio", date: nextReview, note: "Monthly review due", action: "navigate-portfolio" });

  return reminders.sort((a, b) => a.date - b.date);
};

// ─── MAIN RENDER ─────────────────────────────────────────────────
export const refreshDashboard = async () => {
  const investments = getInvestmentsData();
  const allSells = getAllSells();
  const { assets, liabilities } = getWealthData();

  const invAgg = aggregateInvestments(investments);
  const totalLiab = liabilities.reduce((s, l) => s + (l.outstanding || 0), 0);
  const totalAssets = assets.reduce((s, a) => s + (a.currentValue || a.value || 0), 0);
  const netWorth = invAgg.currentValue + totalAssets - totalLiab;

  document.getElementById("nw-value").textContent = formatCurrency(netWorth, "INR", true);
  document.getElementById("dash-invested").textContent = formatCurrency(invAgg.totalInvested, "INR", true);
  document.getElementById("dash-current").textContent = formatCurrency(invAgg.currentValue, "INR", true);

  const totalPnL = invAgg.realized + invAgg.unrealized;
  const pnlEl = document.getElementById("dash-pnl");
  pnlEl.textContent = (totalPnL >= 0 ? "+" : "") + formatCurrency(totalPnL, "INR", true);
  pnlEl.className = "cf-val " + (totalPnL >= 0 ? "positive" : "negative");

  // XIRR
  const cashflows = buildCashflows(investments, allSells);
  const xirrVal = xirr(cashflows);
  document.getElementById("dash-xirr").textContent = xirrVal !== null ? `${xirrVal.toFixed(2)}%` : "—";

  // Snapshot + today's change
  const snaps = recordSnapshot(invAgg.currentValue);
  const change = todaysChange(snaps, invAgg.currentValue);
  const changeEl = document.getElementById("dash-today-change");
  if (change === null) {
    changeEl.textContent = "—";
    changeEl.className = "cf-val";
  } else {
    changeEl.textContent = (change >= 0 ? "+" : "") + formatCurrency(change, "INR", true);
    changeEl.className = "cf-val " + (change >= 0 ? "positive" : "negative");
  }

  // Quick summary + allocation chart
  const quickSummary = computeQuickSummary(investments, allSells, assets, liabilities);
  renderQuickSummaryChart(quickSummary);
  renderQuickSummaryList(quickSummary);

  // Performance chart with active range filter — both lines are now built
  // from real Buy/Sell dates (invested = cumulative cost; current value =
  // cost-basis-over-time with today overridden to live market prices).
  const activeRange = document.querySelector("#perf-range-filter .filter-btn.active")?.dataset.range || "1M";
  const investedSeries = buildInvestedSeries(investments, getAllBuys(), allSells);
  const valueTimeline = getPortfolioCostBasisTimeline();
  const valueSeries = Object.entries(valueTimeline).sort(([a],[b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  renderPortfolioPerformanceChart(
    filterSeriesByRange(investedSeries, activeRange),
    filterSeriesByRange(valueSeries, activeRange)
  );

  // Health score
  const goals = getGoalsData();
  const healthResult = computeHealthScore(investments, quickSummary, goals);
  _lastHealthBreakdown = healthResult.criteria;
  const healthEl = document.getElementById("dash-health-score");
  if (healthEl) healthEl.textContent = healthResult.score;

  // Reminders
  renderReminders(computeReminders());

  populateCapGainsFYOptions();
  renderCapGainsCard();
  bindCapGainsFYFilter();
  bindPerfRangeFilter();
  lucide.createIcons();
};

// ─── DASHBOARD CAPITAL GAINS CARD (STCG/LTCG for selected FY) ──
const populateCapGainsFYOptions = () => {
  const sel = document.getElementById("dash-cg-fy");
  if (!sel || sel.options.length > 0) return; // populate once
  const today = new Date();
  const currentFYStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const fyList = [];
  for (let y = currentFYStart; y >= currentFYStart - 5; y--) fyList.push(`${y}-${String(y+1).slice(2)}`);
  sel.innerHTML = fyList.map(fy => `<option value="${fy}">FY ${fy}</option>`).join("");
};

const bindCapGainsFYFilter = () => {
  document.getElementById("dash-cg-fy")?.addEventListener("change", renderCapGainsCard);
};

const renderCapGainsCard = () => {
  const fy = document.getElementById("dash-cg-fy")?.value;
  if (!fy) return;
  const cg = computeCapitalGainsSummary(fy);

  document.getElementById("dash-stcg-gains").textContent = formatCurrency(cg.stcgGains, "INR", true);
  document.getElementById("dash-stcg-tax").textContent = "Tax: " + formatCurrency(cg.stcgTax, "INR", true);
  document.getElementById("dash-ltcg-gains").textContent = formatCurrency(cg.ltcgGains, "INR", true);
  document.getElementById("dash-ltcg-tax").textContent = "Tax: " + formatCurrency(cg.ltcgTax, "INR", true);
  document.getElementById("dash-slab-gains").textContent = formatCurrency(cg.slabGains, "INR", true);
  document.getElementById("dash-cg-total-tax").textContent = formatCurrency(cg.totalCapGainsTax, "INR", true);
};

const renderQuickSummaryList = (breakdown) => {
  const container = document.getElementById("quick-summary-list");
  if (!container) return;
  container.innerHTML = Object.entries(breakdown).map(([label, value]) => `
    <div class="qs-row">
      <span class="qs-label">${label}</span>
      <span class="qs-value ${value < 0 ? "negative" : ""}">${formatCurrency(value, "INR", true)}</span>
    </div>
  `).join("");
};

const renderReminders = (reminders) => {
  const container = document.getElementById("reminders-list");
  if (!container) return;
  if (reminders.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No upcoming reminders</p></div>`;
    return;
  }
  container.innerHTML = reminders.map(r => `
    <div class="reminder-item ${r.action ? "reminder-item-clickable" : ""}" ${r.action ? `data-action="${r.action}"` : ""}>
      <div class="reminder-title">${r.title}</div>
      <div class="reminder-date">${r.date.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</div>
      <div class="reminder-note">${r.note}</div>
    </div>
  `).join("");
};

const bindPerfRangeFilter = () => {
  document.querySelectorAll("#perf-range-filter .filter-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#perf-range-filter .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const investments = getInvestmentsData();
      const allSells = getAllSells();
      const investedSeries = buildInvestedSeries(investments, getAllBuys(), allSells);
      const valueTimeline = getPortfolioCostBasisTimeline();
      const valueSeries = Object.entries(valueTimeline).sort(([a],[b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
      renderPortfolioPerformanceChart(
        filterSeriesByRange(investedSeries, btn.dataset.range),
        filterSeriesByRange(valueSeries, btn.dataset.range)
      );
    };
  });
};

export const bindDashboardQuickActions = () => {
  document.getElementById("qa-add-investment-dash")?.addEventListener("click", () => openInvModal(null));
  document.getElementById("card-health-score")?.addEventListener("click", openHealthScoreModal);
};

const STATUS_LABEL = { good: "Good", ok: "Fair", bad: "Needs Work" };

const openHealthScoreModal = () => {
  const score = document.getElementById("dash-health-score")?.textContent || "—";
  const rows = _lastHealthBreakdown.map(c => `
    <div class="health-criterion health-${c.status}">
      <div class="health-criterion-header">
        <span class="health-criterion-label">${c.label}</span>
        <span class="health-criterion-badge health-badge-${c.status}">${STATUS_LABEL[c.status]}</span>
        <span class="health-criterion-pts">${Math.round(c.points)}/${c.max}</span>
      </div>
      <div class="health-criterion-detail muted">${c.detail}</div>
      <div class="health-criterion-suggestion">${c.suggestion}</div>
    </div>
  `).join("");

  const body = `
    <div class="tax-highlight" style="margin-bottom:var(--sp-md);text-align:center">
      <div class="muted" style="font-size:0.78rem">Overall Score</div>
      <div style="font-size:2rem;font-weight:700;color:var(--c-primary)">${score} / 100</div>
    </div>
    ${rows || `<div class="muted">No data yet — add investments and goals to see your score breakdown.</div>`}`;

  const footer = `<button class="btn btn-ghost" id="health-modal-close">Close</button>`;
  openModal("Portfolio Health Score", body, footer);
  document.getElementById("health-modal-close").onclick = closeModal;
};
