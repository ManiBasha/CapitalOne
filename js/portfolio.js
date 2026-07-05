// ============================================================
// js/portfolio.js – Portfolio page (macro view: cards, trend, allocation, holdings)
// ============================================================
import { getInvestmentsData, getAllSells, aggregateInvestments, getAssetClassSnapshots, openInvModal } from "./investments.js?v=20260705b";
import { formatCurrency, formatDate } from "./utils.js?v=20260705b";
import { renderPortfolioValueTrendChart, renderSectorAllocChart, renderBrokerAllocChart } from "./charts.js?v=20260705b";

const openQty = (inv, allSells) => {
  const sells = allSells[inv.id] || [];
  const soldQty = sells.reduce((s, sell) => s + sell.quantity, 0);
  return Math.max(0, (inv.quantity || 0) - soldQty);
};

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

  const absReturn = agg.totalInvested > 0 ? (gain / agg.totalInvested) * 100 : 0;
  const absEl = document.getElementById("pf-abs-return");
  absEl.textContent = (absReturn >= 0 ? "+" : "") + absReturn.toFixed(2) + "%";
  absEl.className = "card-value " + (absReturn >= 0 ? "positive" : "negative");

  const returnPctEl = document.getElementById("pf-return-pct");
  returnPctEl.textContent = (absReturn >= 0 ? "+" : "") + absReturn.toFixed(2) + "% overall";
  returnPctEl.className = "card-sub " + (absReturn >= 0 ? "positive" : "negative");

  renderPortfolioValueTrendChart(getAssetClassSnapshots());
  renderSectorAllocChart(investments, allSells);
  renderBrokerAllocChart(investments, allSells);

  renderHoldingsTable(investments, allSells);
  lucide.createIcons();
};

const renderHoldingsTable = (investments, allSells) => {
  const container = document.getElementById("pf-holdings-table-container");
  if (!container) return;

  if (investments.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="briefcase"></i><p>No holdings yet. Add an investment to see it here.</p></div>`;
    return;
  }

  const rows = investments.map(inv => {
    const oQty = openQty(inv, allSells);
    if (oQty <= 0) return ""; // fully exited holdings don't clutter the portfolio view
    const invested = inv.avgPrice * oQty;
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
        <td>${formatCurrency(inv.avgPrice)}</td>
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
