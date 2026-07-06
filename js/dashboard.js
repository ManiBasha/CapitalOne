// ============================================================
// js/dashboard.js Dashboard home page
// ============================================================
import { getInvestmentsData, getAllSells, getAllBuys, aggregateInvestments, openInvModal } from "./investments.js?v=20260705b";
import { getWealthData } from "./wealth.js?v=20260705b";
import { getGoalsData } from "./goals.js?v=20260705b";
import { formatCurrency, todayISO, ls } from "./utils.js?v=20260705b";
import { renderQuickSummaryChart, renderPortfolioPerformanceChart } from "./charts.js?v=20260705b";

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
    "Equity":       byType(["Equity"]),
    "Mutual Funds": byType(["Mutual Fund"]),
    "Commodity":    byType(["Commodity"]) + assetByCat(["Gold/Jewelry"]),
    "FD":           byType(["FD"]),
    "Cash":         assetByCat(["Cash", "Bank Deposit"]),
    "Other Assets": assetByCat(["Real Estate", "Vehicle", "Other"]),
    "Liabilities":  -liabilities.reduce((s, l) => s + (l.outstanding || 0), 0),
  };
};

// ─── PORTFOLIO HEALTH SCORE (0-100, simple heuristic) ──────────
const computeHealthScore = (investments, quickSummary, goals) => {
  let score = 0;
  // Diversification: fewer than 2 non-empty buckets = weak
  const buckets = Object.entries(quickSummary).filter(([k, v]) => k !== "Liabilities" && v > 0).length;
  score += Math.min(buckets * 8, 32); // up to 32 pts for spreading across asset classes

  // Concentration: no single holding should dominate the equity book
  const equityInvs = investments.filter(i => i.assetType === "Equity");
  const equityTotal = equityInvs.reduce((s, i) => s + (i.currentPrice || i.avgPrice) * (i.quantity || 0), 0);
  const maxHolding = Math.max(0, ...equityInvs.map(i => (i.currentPrice || i.avgPrice) * (i.quantity || 0)));
  const concentration = equityTotal > 0 ? maxHolding / equityTotal : 0;
  score += concentration < 0.25 ? 25 : concentration < 0.4 ? 15 : concentration < 0.6 ? 8 : 0;

  // Emergency fund proxy: Cash bucket vs total portfolio
  const total = Object.entries(quickSummary).filter(([k]) => k !== "Liabilities").reduce((s, [,v]) => s + v, 0);
  const cashRatio = total > 0 ? (quickSummary["Cash"] || 0) / total : 0;
  score += cashRatio >= 0.1 ? 18 : cashRatio >= 0.05 ? 10 : 4;

  // Goal funding
  if (goals.length) {
    const avgProgress = goals.reduce((s, g) => s + Math.min(1, (g.currentAmount || 0) / (g.targetAmount || 1)), 0) / goals.length;
    score += avgProgress * 15;
  } else {
    score += 6; // neutral if no goals set yet
  }

  // Leverage: liabilities vs assets
  const liabRatio = total > 0 ? Math.abs(quickSummary["Liabilities"] || 0) / total : 0;
  score += liabRatio < 0.2 ? 10 : liabRatio < 0.4 ? 5 : 0;

  return Math.round(Math.min(100, score));
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

  // Performance chart with active range filter — invested line goes back to
  // the real first purchase date; current-value line layers on from snapshots.
  const activeRange = document.querySelector("#perf-range-filter .filter-btn.active")?.dataset.range || "1M";
  const investedSeries = buildInvestedSeries(investments, getAllBuys(), allSells);
  const valueSeries = Object.entries(snaps).sort(([a],[b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  renderPortfolioPerformanceChart(
    filterSeriesByRange(investedSeries, activeRange),
    filterSeriesByRange(valueSeries, activeRange)
  );

  // Health score
  const goals = getGoalsData();
  const health = computeHealthScore(investments, quickSummary, goals);
  const healthEl = document.getElementById("dash-health-score");
  if (healthEl) healthEl.textContent = health;

  // Reminders
  renderReminders(computeReminders());

  bindPerfRangeFilter();
  lucide.createIcons();
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
      const snaps = ls.get(SNAPSHOT_KEY, {});
      const investedSeries = buildInvestedSeries(investments, getAllBuys(), allSells);
      const valueSeries = Object.entries(snaps).sort(([a],[b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
      renderPortfolioPerformanceChart(
        filterSeriesByRange(investedSeries, btn.dataset.range),
        filterSeriesByRange(valueSeries, btn.dataset.range)
      );
    };
  });
};

export const bindDashboardQuickActions = () => {
  document.getElementById("qa-add-investment-dash")?.addEventListener("click", () => openInvModal(null));
};
