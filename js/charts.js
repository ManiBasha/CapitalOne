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

const gridColor  = () => isDark() ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
const textColor  = () => isDark() ? "#a8b887" : "#6b7280";
const fontFamily = "'Inter', sans-serif";

const baseOptions = () => ({
  responsive: true,
  maintainAspectRatio: true,
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
      plugins: { ...baseOptions().plugins, legend: { position: "bottom", labels: { color: textColor(), font: { family: fontFamily, size: 11 } } } }
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
          legend: { position: "bottom", labels: { color: textColor(), font: { family: fontFamily, size: 11 } } }
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
        legend: { position: "bottom", labels: { color: textColor(), font: { family: fontFamily, size: 11 } } }
      }
    }
  });
};

// ─── DASHBOARD: PORTFOLIO PERFORMANCE LINE ────────────────────
// series: [{ date: "YYYY-MM-DD", value: number }, ...]
export const renderPortfolioPerformanceChart = (series) => {
  const ctx = document.getElementById("chart-portfolio-performance");
  if (!ctx) return;
  destroyChart("portfolio-performance");

  chartInstances["portfolio-performance"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: series.map(p => p.date),
      datasets: [{
        label: "Portfolio Value",
        data: series.map(p => p.value),
        borderColor: "#5a6e3a",
        backgroundColor: "rgba(90,110,58,0.10)",
        fill: true,
        tension: 0.35,
        pointRadius: series.length > 40 ? 0 : 3,
        pointBackgroundColor: "#5a6e3a"
      }]
    },
    options: { ...baseOptions(), plugins: { ...baseOptions().plugins, legend: { display: false } } }
  });
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
