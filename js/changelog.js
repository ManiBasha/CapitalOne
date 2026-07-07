// ============================================================
// js/changelog.js – Version history shown to the user in Settings
// ============================================================
// Update this list whenever meaningful changes ship, so users can see what
// changed and when without digging through commits.
export const CHANGELOG = [
  {
    version: "v8",
    date: "2026-07-07",
    title: "Goals, Charts & Health Score Overhaul",
    changes: [
      "Goal contributions now have full history — add/edit/delete individual entries instead of overwriting one total",
      "Optional 'Link to Goal' when buying an investment — counts the purchase toward that goal automatically",
      "Transaction-level Excel export: one row per Buy/Sell with Asset Name, Type, Qty, Buy/Sell/Current Price, Buy/Sell Date, Broker, Sector, Exit Load, Total Charges",
      "Dashboard: new Capital Gains card showing STCG/LTCG gains + tax for a selected Financial Year",
      "Charts fixed to fit mobile screens properly (no more horizontal overflow)",
      "All pie/doughnut charts made smaller, with % allocation shown in the legend",
      "Portfolio page: 'Absolute Return' replaced with CAGR",
      "Portfolio Health Score is now clickable — shows a full breakdown per criterion (Good/Fair/Needs Work) with specific suggestions",
      "Added Emergency Fund (and Provident Fund, Insurance) as Asset categories — Emergency Fund now factors directly into the Health Score",
      "Value Trend by Asset Class and Portfolio Performance charts now reconstructed from real Buy/Sell dates, going back to your actual first purchase — no longer dependent on when the snapshot feature started running",
    ]
  },
  {
    version: "v6",
    date: "2026-07-06",
    title: "Income Tax: Capital Gains Engine",
    changes: [
      "Capital gains (STCG/LTCG) now auto-computed from your actual Investments buy/sell history — no manual entry needed",
      "STCG (≤365 days held): taxed at 20%",
      "LTCG (>365 days held): ₹1,25,000 annual exemption, remainder at 12.5%",
      "Gold/Commodity/Debt Mutual Funds taxed at your income slab rate instead",
      '"Which holdings contributed" breakdown per financial year, linking back to Investments',
      "New 'Tax Treatment' field on Mutual Fund / custom holdings to mark Equity vs Debt/Gold for correct tax bucketing",
    ]
  },
  {
    version: "v5",
    date: "2026-07-06",
    title: "Charges & FIFO Lot Matching",
    changes: [
      "Buy/Sell now track full Indian brokerage charges: brokerage, STT, exchange charges, SEBI charges, GST, stamp duty, DP charges, exit load (editable, with sensible defaults)",
      "Sells now match against the OLDEST buy lots first (FIFO), giving the correct holding period for tax purposes",
      "Realized P&L is now net of all charges, shown everywhere (tables, History modal, Sell preview)",
    ]
  },
  {
    version: "v4",
    date: "2026-07-05",
    title: "Custom Asset Types & Performance Chart Fix",
    changes: [
      "Add Investment now supports '+ Add New Asset Type' (e.g. US Stocks, Japan Stocks) with its own tab",
      "Investments page: filter Realized P&L by Financial Year or a custom date range",
      "Dashboard's Portfolio Performance chart now starts from your actual first purchase date, not just today, with an Invested-vs-Current-Value comparison",
    ]
  },
  {
    version: "v3",
    date: "2026-07-05",
    title: "Critical Login Fix",
    changes: [
      "Fixed a duplicate Firebase initialization bug that silently broke Google Sign-In (and everything else) after other fixes were deployed",
      "Confirmed Firebase config is correctly separated so future updates never overwrite your real API keys",
    ]
  },
  {
    version: "v2",
    date: "2026-07-04",
    title: "App Purpose Change: Wealth & Investment Dashboard",
    changes: [
      "Repositioned the app from a general expense tracker to a focused Wealth & Investment Dashboard — removed Money/Transactions/Calendar/Accounts entirely",
      "New Dashboard home page: Net Worth, Total Invested, Current Value, Unrealized P&L, Today's Change, XIRR, and a Portfolio Health Score (0-100)",
      "New Quick Summary breakdown (Equity/Mutual Funds/Cash/Gold/Other/Liabilities) with its own chart",
      "Upcoming Reminders (ITR filing countdown, monthly portfolio review) with adjustable dates in Settings",
    ]
  },
  {
    version: "v1",
    date: "2026-07-03",
    title: "Foundation: Bug Fixes, Responsive Shell & Theming",
    changes: [
      "Fixed root cause of data loss on redeploy — Firebase keys moved to their own file that's never overwritten",
      "Fixed 'Delete All Data' sometimes failing (missing sub-collection cleanup, no error handling)",
      "Mobile: floating glass-style bottom navigation replaces the old off-canvas drawer, fixing content cut off on small screens",
      "Desktop: sidebar is now collapsible",
      "New color-wheel theme picker generates matching Light + Dark palettes from one color",
      "Settings moved behind your name/avatar; redesigned as an expandable card list",
      "Custom app icon upload",
    ]
  },
];

export const renderChangeLog = () => {
  const container = document.getElementById("changelog-list");
  if (!container) return;
  container.innerHTML = CHANGELOG.map(entry => `
    <div class="changelog-entry">
      <div class="changelog-entry-header">
        <span class="changelog-version">${entry.version}</span>
        <span class="changelog-title">${entry.title}</span>
        <span class="changelog-date">${new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
      </div>
      <ul class="changelog-changes">
        ${entry.changes.map(c => `<li>${c}</li>`).join("")}
      </ul>
    </div>
  `).join("");
};
