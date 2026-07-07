// ============================================================
// js/charts.js  – Chart.js rendering
// ============================================================

const PALETTE = [
  "#5a6e3a","#7a9a4a","#a8b887","#b8962e","#8b6347",
  "#4a5c2e","#c8d8a0","#d4a853","#6b7280","#10b981",
  "#3b82f6","#8b5cf6","#ef4444","#ec4899","#f59e0b"
];

const chartInstances = {};

const destroyChart = (id) => {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
};

const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

// Shared legend generator for doughnut/pie charts — appends each slice's
// share of the total (e.g. "Equity  45.2%") instead of the plain label.
const percentLegend = () => ({
  generateLabels: (chart) => {
    const data = chart.data;
    if (!data.labels?.length || !data.datasets?.length) return [];
    const values = data.datasets[0].data;
    const total = values.reduce((s, v) => s + (v || 0), 0) || 1;
    return data.labels.map((label, i) => ({
      text: `${label}  ${((values[i] / total) * 100).toFixed(1)}%`,
      fillStyle: data.datasets[0].backgroundColor[i],
      strokeStyle: data.datasets[0].borderColor,
      lineWidth: data.datasets[0].borderWidth,
      index: i,
    }));
  }
});

const gridColor  = () => isDark() ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
const textColor  = () => isDark() ? "#a8b887" : "#6b7280";
const fontFamily = "'Inter', sans-serif";

const baseOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: textColor(), font: { family: fontFamily, size: 12 } }
    },
    tooltip: {
      backgroundColor: isDark() ? "#242d16" : "#fff",
      titleColor: isDark() ? "#e8eede" : "#1a2210",
      bodyColor: textColor(),
      borderColor: isDark() ? "#2e3c1e" : "#e0ddd4",
      borderWidth: 1,
    }
  },
  scales: {
    x: { grid: { color: gridColor() }, ticks: { color: textColor(), font: { family: fontFamily } } },
    y: { grid: { color: gridColor() }, ticks: { color: textColor(), font: { family: fontFamily },
          callback: (v) => "₹" + Intl.NumberFormat("en-IN",{notation:"compact"}).format(v) } }
  }
});

// ─── ASSET ALLOCATION PIE ─────────────────────────────────────
export const renderAssetAllocChart = (assets) => {
  const ctx = document.getElementById("chart-asset-alloc");
  if (!ctx) return;
  destroyChart("asset-alloc");

  const groups = {};
  assets.forEach(a => { groups[a.category||"Other"] = (groups[a.category||"Other"] || 0) + (a.currentValue || a.value || 0); });

  chartInstances["asset-alloc"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(groups),
      datasets: [{ data: Object.values(groups), backgroundColor: PALETTE, borderWidth: 2, borderColor: isDark()?"#242d16":"#fff" }]
    },
    options: {
      ...baseOptions(),
      scales: {},
      legend: { position: "bottom", labels: { ...percentLegend(), color: textColor(), font: { family: fontFamily, size: 11 } } }
    }
  });
};

// ─── NET WORTH TIMELINE ───────────────────────────────────────
export const renderNWTimeline = (history) => {
  const ctx = document.getElementById("chart-nw-timeline");
  if (!ctx) return;
  destroyChart("nw-timeline");

  // Synthetic last-12-month labels if no history provided
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
  }
  const data = history.length ? history : months.map(() => 0);

  chartInstances["nw-timeline"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        label: "Net Worth",
        data,
        borderColor: "#5a6e3a",
        backgroundColor: "rgba(90,110,58,0.10)",
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: "#5a6e3a"
      }]
    },
    options: { ...baseOptions(), plugins: { ...baseOptions().plugins, legend: { display: false } } }
  });
};

// ─── INVESTMENT CHARTS ────────────────────────────────────────
export const renderInvCharts = (investments, allSells = {}) => {

  // ── Allocation doughnut ──────────────────────────────────────
  const invCtx = document.getElementById("chart-inv-alloc");
  if (invCtx) {
    destroyChart("inv-alloc");
    const groups = {};
    investments.forEach(inv => {
      const k   = inv.assetType || "Other";
      const qty = Math.max(0, inv.quantity - (allSells[inv.id]||[]).reduce((s,sl)=>s+sl.quantity,0));
      groups[k] = (groups[k]||0) + ((inv.currentPrice||inv.avgPrice) * qty || 0);
    });

    chartInstances["inv-alloc"] = new Chart(invCtx, {
      type: "doughnut",
      data: {
        labels: Object.keys(groups),
        datasets: [{
          data: Object.values(groups),
          backgroundColor: PALETTE,
          borderWidth: 2,
          borderColor: isDark() ? "#242d16" : "#fff"
        }]
      },
      options: {
        ...baseOptions(), scales: {},
        plugins: {
          ...baseOptions().plugins,
          legend: { position: "bottom", labels: { ...percentLegend(), color: textColor(), font: { family: fontFamily, size: 11 } } }
        }
      }
    });
  }

  // ── Money flow bar chart — real cash in/out per month ────────
  const growthCtx = document.getElementById("chart-portfolio-growth");
  if (!growthCtx) return;
  destroyChart("portfolio-growth");

  // Build 12-month buckets
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      ym:    d.toISOString().slice(0, 7),
      invested: 0,
      proceeds: 0,
    });
  }

  // Map buys
  investments.forEach(inv => {
    const ym = (inv.purchaseDate || "").slice(0, 7);
    const bucket = months.find(m => m.ym === ym);
    if (bucket) bucket.invested += (inv.avgPrice * inv.quantity) || 0;
  });

  // Map sells
  Object.entries(allSells).forEach(([invId, sells]) => {
    const inv = investments.find(i => i.id === invId);
    if (!inv) return;
    sells.forEach(sell => {
      const ym = (sell.sellDate || "").slice(0, 7);
      const bucket = months.find(m => m.ym === ym);
      if (bucket) bucket.proceeds += sell.sellPrice * sell.quantity;
    });
  });

  chartInstances["portfolio-growth"] = new Chart(growthCtx, {
    type: "bar",
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: "Money In (Invested)",
          data: months.map(m => m.invested),
          backgroundColor: "rgba(90,110,58,0.75)",
          borderRadius: 4,
        },
        {
          label: "Money Out (Sale Proceeds)",
          data: months.map(m => m.proceeds),
          backgroundColor: "rgba(184,150,46,0.75)",
          borderRadius: 4,
        }
      ]
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ₹${Intl.NumberFormat("en-IN").format(ctx.raw)}`
          }
        }
      }
    }
  });
};

// ─── CASH FLOW BAR CHART ─────────────────────────────────────
export const renderCashFlowChart = (txns) => {
  const ctx = document.getElementById("chart-cashflow");
  if (!ctx) return;
  destroyChart("cashflow");

  const months = [];
  const incomeData = [], expenseData = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("en-IN",{month:"short"});
    const ym = d.toISOString().slice(0,7);
    months.push(label);

    const monthTxns = txns.filter(t=>(t.date||"").startsWith(ym));
    incomeData.push(monthTxns.filter(t=>t.type==="income").reduce((s,t)=>s+(t.amountINR||t.amount||0),0));
    expenseData.push(monthTxns.filter(t=>t.type==="expense").reduce((s,t)=>s+(t.amountINR||t.amount||0),0));
  }

  chartInstances["cashflow"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Income",  data: incomeData,  backgroundColor: "rgba(45,122,79,0.7)" },
        { label: "Expense", data: expenseData, backgroundColor: "rgba(192,57,43,0.6)" }
      ]
    },
    options: { ...baseOptions(), plugins: { ...baseOptions().plugins } }
  });
};

// ─── DASHBOARD: QUICK SUMMARY DOUGHNUT ────────────────────────
// Generic {label: value} breakdown chart — used for the Dashboard's
// Equity/Mutual Funds/Cash/Gold/Other Assets/Liabilities summary.
export const renderQuickSummaryChart = (breakdown) => {
  const ctx = document.getElementById("chart-quick-summary");
  if (!ctx) return;
  destroyChart("quick-summary");

  const entries = Object.entries(breakdown).filter(([,v]) => v);
  chartInstances["quick-summary"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{
        data: entries.map(([,v]) => v),
        backgroundColor: PALETTE,
        borderWidth: 2,
        borderColor: isDark() ? "#242d16" : "#fff"
      }]
    },
    options: {
      ...baseOptions(), scales: {},
      plugins: {
        ...baseOptions().plugins,
        legend: { position: "bottom", labels: { ...percentLegend(), color: textColor(), font: { family: fontFamily, size: 11 } } }
      }
    }
  });
};

// ─── DASHBOARD: PORTFOLIO PERFORMANCE LINE ────────────────────
// investedSeries: [{ date, value }] — cumulative money invested, from the
//   actual first purchase date (accurate all the way back).
// valueSeries: [{ date, value }] — current market value from daily
//   snapshots (only available from when the app started recording).
export const renderPortfolioPerformanceChart = (investedSeries, valueSeries = []) => {
  const ctx = document.getElementById("chart-portfolio-performance");
  if (!ctx) return;
  destroyChart("portfolio-performance");

  // Union of all dates so both lines share one axis; missing points are
  // left null so Chart.js just doesn't draw that segment (no fake zeros).
  const allDates = [...new Set([...investedSeries.map(p=>p.date), ...valueSeries.map(p=>p.date)])].sort();
  const investedMap = Object.fromEntries(investedSeries.map(p => [p.date, p.value]));
  const valueMap = Object.fromEntries(valueSeries.map(p => [p.date, p.value]));

  chartInstances["portfolio-performance"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: allDates,
      datasets: [
        {
          label: "Invested (cumulative)",
          data: allDates.map(d => investedMap[d] ?? null),
          borderColor: "#94a06a",
          backgroundColor: "rgba(148,160,106,0.08)",
          borderDash: [5, 3],
          fill: false,
          tension: 0.2,
          spanGaps: true,
          pointRadius: 0,
        },
        {
          label: "Current Value",
          data: allDates.map(d => valueMap[d] ?? null),
          borderColor: "#5a6e3a",
          backgroundColor: "rgba(90,110,58,0.10)",
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: allDates.length > 40 ? 0 : 3,
          pointBackgroundColor: "#5a6e3a"
        }
      ]
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        legend: { display: true, position: "bottom", labels: { color: textColor(), font: { family: fontFamily, size: 11 } } }
      }
    }
  });
};

// ─── PORTFOLIO: VALUE TREND BY ASSET CLASS ────────────────────
// snaps: { "YYYY-MM-DD": { Equity, "Mutual Fund", Commodity, FD } }
export const renderPortfolioValueTrendChart = (snaps) => {
  const ctx = document.getElementById("chart-portfolio-value-trend");
  if (!ctx) return;
  destroyChart("portfolio-value-trend");

  const dates = Object.keys(snaps).sort();
  const BASE_COLORS = {
    "Equity": "#5a6e3a", "Mutual Fund": "#b8962e", "Commodity": "#8b5cf6", "FD": "#3b82f6"
  };
  const EXTRA_COLORS = ["#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

  // Collect every asset-type key that has ever appeared in the snapshots
  // (base 4 + any custom types the user added), so custom types get their
  // own line automatically.
  const allTypes = [...new Set(dates.flatMap(d => Object.keys(snaps[d] || {})))];
  let extraIdx = 0;
  const types = allTypes.map(key => ({
    key,
    color: BASE_COLORS[key] || EXTRA_COLORS[extraIdx++ % EXTRA_COLORS.length]
  }));

  chartInstances["portfolio-value-trend"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: types.map(t => ({
        label: t.key,
        data: dates.map(d => snaps[d]?.[t.key] || 0),
        borderColor: t.color,
        backgroundColor: t.color + "22",
        fill: false,
        tension: 0.35,
        pointRadius: dates.length > 40 ? 0 : 3,
        pointBackgroundColor: t.color
      }))
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        legend: { position: "bottom", labels: { color: textColor(), font: { family: fontFamily, size: 11 } } }
      }
    }
  });
};

// ─── PORTFOLIO: SECTOR / BROKER ALLOCATION ────────────────────
const renderGenericAllocDoughnut = (canvasId, chartKey, groups) => {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  destroyChart(chartKey);
  const entries = Object.entries(groups).filter(([,v]) => v > 0);
  chartInstances[chartKey] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{
        data: entries.map(([,v]) => v),
        backgroundColor: PALETTE,
        borderWidth: 2,
        borderColor: isDark() ? "#242d16" : "#fff"
      }]
    },
    options: {
      ...baseOptions(), scales: {},
      plugins: {
        ...baseOptions().plugins,
        legend: { position: "bottom", labels: { ...percentLegend(), color: textColor(), font: { family: fontFamily, size: 11 } } }
      }
    }
  });
};

export const renderSectorAllocChart = (investments, allSells = {}) => {
  const groups = {};
  investments.forEach(inv => {
    const sells = allSells[inv.id] || [];
    const oQty = Math.max(0, (inv.quantity||0) - sells.reduce((s,sl)=>s+sl.quantity,0));
    const k = inv.sector || "Unspecified";
    groups[k] = (groups[k]||0) + (inv.currentPrice||inv.avgPrice) * oQty;
  });
  renderGenericAllocDoughnut("chart-sector-alloc", "sector-alloc", groups);
};

export const renderBrokerAllocChart = (investments, allSells = {}) => {
  const groups = {};
  investments.forEach(inv => {
    const sells = allSells[inv.id] || [];
    const oQty = Math.max(0, (inv.quantity||0) - sells.reduce((s,sl)=>s+sl.quantity,0));
    const k = inv.broker || "Unspecified";
    groups[k] = (groups[k]||0) + (inv.currentPrice||inv.avgPrice) * oQty;
  });
  renderGenericAllocDoughnut("chart-broker-alloc", "broker-alloc", groups);
};

// Update chart colors when theme changes
export const refreshChartTheme = () => {
  Object.values(chartInstances).forEach(c => {
    if (c.options?.scales) {
      Object.values(c.options.scales).forEach(axis => {
        if (axis.grid) axis.grid.color = gridColor();
        if (axis.ticks) axis.ticks.color = textColor();
      });
    }
    if (c.options?.plugins?.legend?.labels) c.options.plugins.legend.labels.color = textColor();
    c.update("none");
  });
};
