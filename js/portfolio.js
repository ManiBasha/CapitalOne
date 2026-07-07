// ============================================================
// js/portfolio.js – Portfolio page (macro view: cards, trend, allocation, holdings)
// ============================================================
import { getInvestmentsData, getAllSells, aggregateInvestments, getAssetClassCostBasisTimeline, fifoSummaryForHolding, openInvModal } from "./investments.js?v=20260707a";
import { formatCurrency, formatDate, todayISO } from "./utils.js?v=20260707a";
import { renderPortfolioValueTrendChart, renderSectorAllocChart, renderBrokerAllocChart } from "./charts.js?v=20260707a";

export const refreshPortfolioPage = () => {
  const investments = getInvestmentsData();
  const allSells = getAllSells();
  const agg = aggregateInvestments(investments);

  document.getElementById("pf-invested").textContent = formatCurrency(agg.totalInvested, "INR", true);
  document.getElementById("pf-current").textContent = formatCurrency(agg.currentValue, "INR", true);

  const gain = agg.currentValue - agg.totalInvested;
  const gainEl = document.getElementById("pf-gain");
  gainEl.textContent = (gain >= 0 ? "+" : "") + formatCurrency(gain, "INR", true);
  gainEl.className = "card-value " + (gain >= 0 ? "positive" : "negative");

  // CAGR — annualized return since the earliest buy across all holdings
  const cagr = computeCAGR(investments, agg.totalInvested, agg.currentValue);
  const cagrEl = document.getElementById("pf-cagr");
  cagrEl.textContent = (cagr === null) ? "—" : (cagr >= 0 ? "+" : "") + cagr.toFixed(2) + "%";
  cagrEl.className = "card-value " + (cagr !== null && cagr >= 0 ? "positive" : cagr !== null ? "negative" : "");

  const returnPct = agg.totalInvested > 0 ? (gain / agg.totalInvested) * 100 : 0;
  const returnPctEl = document.getElementById("pf-return-pct");
  returnPctEl.textContent = (returnPct >= 0 ? "+" : "") + returnPct.toFixed(2) + "% overall";
  returnPctEl.className = "card-sub " + (returnPct >= 0 ? "positive" : "negative");

  renderPortfolioValueTrendChart(getAssetClassCostBasisTimeline());
  renderSectorAllocChart(investments, allSells);
  renderBrokerAllocChart(investments, allSells);

  renderHoldingsTable(investments);
  lucide.createIcons();
};

// CAGR = (Current Value / Total Invested) ^ (1 / years) - 1, using the
// earliest buy-lot date across all holdings as the start of the period.
const computeCAGR = (investments, totalInvested, currentValue) => {
  if (totalInvested <= 0 || currentValue <= 0) return null;
  let earliest = null;
  investments.forEach(inv => {
    if (inv.purchaseDate && (!earliest || inv.purchaseDate < earliest)) earliest = inv.purchaseDate;
  });
  if (!earliest) return null;
  const years = (new Date(todayISO()) - new Date(earliest)) / (365.25 * 86400000);
  if (years < (1/365)) return null; // too recent to annualize meaningfully
  return (Math.pow(currentValue / totalInvested, 1 / years) - 1) * 100;
};

const renderHoldingsTable = (investments) => {
  const container = document.getElementById("pf-holdings-table-container");
  if (!container) return;

  if (investments.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="briefcase"></i><p>No holdings yet. Add an investment to see it here.</p></div>`;
    return;
  }

  const rows = investments.map(inv => {
    const fifo = fifoSummaryForHolding(inv);
    const oQty = fifo.openQty;
    if (oQty <= 0) return ""; // fully exited holdings don't clutter the portfolio view
    const invested = fifo.openCost;
    const curVal = (inv.currentPrice || inv.avgPrice) * oQty;
    const pnl = curVal - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const cls = pnl >= 0 ? "positive" : "negative";
    return `
      <tr>
        <td><strong>${inv.name}</strong></td>
        <td>${inv.sector || "—"}</td>
        <td>${inv.assetType}</td>
        <td>${oQty}</td>
        <td>${formatCurrency(fifo.avgOpenPrice)}</td>
        <td>${formatCurrency(inv.currentPrice||inv.avgPrice)}</td>
        <td>${formatCurrency(invested)}</td>
        <td>${formatCurrency(curVal)}</td>
        <td class="${cls}">${pnl>=0?"+":""}${formatCurrency(pnl)}</td>
        <td class="${cls}">${pnlPct>=0?"+":""}${pnlPct.toFixed(2)}%</td>
        <td>${inv.broker || "—"}</td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="inv-table-wrap">
      <table class="inv-table">
        <thead>
          <tr>
            <th>Symbol</th><th>Sector</th><th>Asset Type</th><th>Qty</th>
            <th>Avg Price</th><th>Current</th><th>Invested</th><th>Current Value</th>
            <th>P&amp;L</th><th>P&amp;L %</th><th>Broker</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="11" class="muted" style="text-align:center;padding:1rem">No open holdings</td></tr>`}</tbody>
      </table>
    </div>`;
};
