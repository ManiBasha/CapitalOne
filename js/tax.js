// ============================================================
// js/tax.js  – Indian Income Tax Calculator (FY 2025-26)
// ============================================================
import { formatCurrency, toast } from "./utils.js?v=20260705b";

export const initTax = () => {
  document.getElementById("btn-calc-tax")?.addEventListener("click", calculateTax);

  // Show/hide old regime fields
  document.querySelectorAll('input[name="regime"]').forEach(r => {
    r.addEventListener("change", () => {
      const show = r.value !== "new";
      document.getElementById("old-regime-fields").style.display = show ? "block" : "none";
    });
  });

  // Default: hide old-regime fields (new regime selected)
  document.getElementById("old-regime-fields").style.display = "none";
};

// ─── SLAB CALCULATORS ────────────────────────────────────────
const calcNewRegimeTax = (income, age, fy) => {
  // FY 2025-26 New Regime slabs
  const slabs = [
    { limit: 300000,  rate: 0 },
    { limit: 700000,  rate: 0.05 },
    { limit: 1000000, rate: 0.10 },
    { limit: 1200000, rate: 0.15 },
    { limit: 1500000, rate: 0.20 },
    { limit: Infinity, rate: 0.30 },
  ];
  const standardDeduction = 75000;
  const taxable = Math.max(0, income - standardDeduction);
  return computeSlabTax(taxable, slabs);
};

const calcOldRegimeTax = (income, age, deductions) => {
  const {
    c80c = 0, c80d = 0, hra = 0, homeLoan = 0, otherDed = 0
  } = deductions;

  const totalDed = Math.min(c80c, 150000) + Math.min(c80d, 50000) + hra + Math.min(homeLoan, 200000) + otherDed + 50000; // 50k standard ded
  const taxable  = Math.max(0, income - totalDed);

  let slabs;
  if (age >= 80) {
    slabs = [
      { limit: 500000,  rate: 0 },
      { limit: 1000000, rate: 0.20 },
      { limit: Infinity, rate: 0.30 },
    ];
  } else if (age >= 60) {
    slabs = [
      { limit: 300000,  rate: 0 },
      { limit: 500000,  rate: 0.05 },
      { limit: 1000000, rate: 0.20 },
      { limit: Infinity, rate: 0.30 },
    ];
  } else {
    slabs = [
      { limit: 250000,  rate: 0 },
      { limit: 500000,  rate: 0.05 },
      { limit: 1000000, rate: 0.20 },
      { limit: Infinity, rate: 0.30 },
    ];
  }
  return { tax: computeSlabTax(taxable, slabs), taxable, totalDed };
};

const computeSlabTax = (income, slabs) => {
  let tax = 0, prev = 0;
  for (const slab of slabs) {
    if (income <= prev) break;
    const taxable = Math.min(income, slab.limit) - prev;
    tax  += taxable * slab.rate;
    prev  = slab.limit;
  }
  return tax;
};

const addSurchargeAndCess = (tax, income) => {
  let surcharge = 0;
  if (income > 50000000)     surcharge = tax * 0.37;
  else if (income > 20000000) surcharge = tax * 0.25;
  else if (income > 10000000) surcharge = tax * 0.15;
  else if (income > 5000000)  surcharge = tax * 0.10;
  const cess = (tax + surcharge) * 0.04;
  return tax + surcharge + cess;
};

// ─── MAIN CALCULATE ───────────────────────────────────────────
const calculateTax = () => {
  const fy      = document.getElementById("tax-fy").value;
  const regime  = document.querySelector('input[name="regime"]:checked')?.value || "new";
  const age     = +document.getElementById("tax-age").value || 30;
  const salary  = +document.getElementById("tax-salary").value || 0;
  const biz     = +document.getElementById("tax-business").value || 0;
  const capGain = +document.getElementById("tax-capgains").value || 0;
  const other   = +document.getElementById("tax-other-income").value || 0;
  const totalIncome = salary + biz + other; // capgains handled separately

  const deductions = {
    c80c:     +document.getElementById("tax-80c")?.value || 0,
    c80d:     +document.getElementById("tax-80d")?.value || 0,
    hra:      +document.getElementById("tax-hra")?.value || 0,
    homeLoan: +document.getElementById("tax-homeloan")?.value || 0,
    otherDed: +document.getElementById("tax-other-ded")?.value || 0,
  };

  let result;
  if (regime === "compare") {
    const newT = addSurchargeAndCess(calcNewRegimeTax(totalIncome, age, fy), totalIncome);
    const { tax: oldTaxBase, taxable, totalDed } = calcOldRegimeTax(totalIncome, age, deductions);
    const oldT = addSurchargeAndCess(oldTaxBase, totalIncome);
    result = renderCompare({ newT, oldT, totalIncome, totalDed, taxable, age, fy });
  } else if (regime === "new") {
    const baseTax = calcNewRegimeTax(totalIncome, age, fy);
    const total   = addSurchargeAndCess(baseTax, totalIncome);
    result = renderResult({ tax: total, totalIncome, regime: "New", standardDed: 75000, taxable: Math.max(0, totalIncome - 75000) });
  } else {
    const { tax: baseTax, taxable, totalDed } = calcOldRegimeTax(totalIncome, age, deductions);
    const total = addSurchargeAndCess(baseTax, totalIncome);
    result = renderResult({ tax: total, totalIncome, regime: "Old", totalDed, taxable });
  }

  document.getElementById("tax-result-panel").innerHTML = result;
  lucide.createIcons();
};

const renderResult = ({ tax, totalIncome, regime, totalDed, standardDed, taxable }) => {
  const effective = totalIncome > 0 ? (tax / totalIncome * 100).toFixed(2) : 0;
  return `
    <div class="card tax-result-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-md)">
        <h3>Tax Calculation</h3>
        <span class="tax-regime-badge">${regime} Regime</span>
      </div>
      <div class="result-row"><span class="result-label">Gross Income</span><span class="result-val">${formatCurrency(totalIncome)}</span></div>
      <div class="result-row"><span class="result-label">Total Deductions</span><span class="result-val">${formatCurrency(totalDed||standardDed||0)}</span></div>
      <div class="result-row"><span class="result-label">Taxable Income</span><span class="result-val">${formatCurrency(taxable)}</span></div>
      <div class="result-row"><span class="result-label">Tax (incl. surcharge & cess)</span><span class="result-val">${formatCurrency(tax)}</span></div>
      <div class="result-row"><span class="result-label">Effective Tax Rate</span><span class="result-val">${effective}%</span></div>
      <div class="tax-highlight">
        <div class="muted" style="font-size:0.75rem;margin-bottom:4px">Tax Payable</div>
        <div style="font-size:1.6rem;font-weight:700;color:var(--c-primary)">${formatCurrency(tax)}</div>
        <div class="muted" style="font-size:0.78rem;margin-top:4px">Effective rate: ${effective}%</div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="window.downloadTaxPDF()" style="margin-top:var(--sp-md)">
        <i data-lucide="download"></i> Download PDF
      </button>
    </div>`;
};

const renderCompare = ({ newT, oldT, totalIncome, totalDed, taxable, age, fy }) => {
  const better    = newT <= oldT ? "New" : "Old";
  const saving    = Math.abs(newT - oldT);
  const effNew    = totalIncome > 0 ? (newT/totalIncome*100).toFixed(2) : 0;
  const effOld    = totalIncome > 0 ? (oldT/totalIncome*100).toFixed(2) : 0;
  return `
    <div class="card tax-result-card">
      <h3 style="margin-bottom:var(--sp-md)">Regime Comparison</h3>
      <div class="result-row"><span class="result-label">Gross Income</span><span class="result-val">${formatCurrency(totalIncome)}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm);margin:var(--sp-md) 0">
        <div class="card" style="${newT<=oldT?"border-color:var(--c-primary);border-width:2px":""}">
          <div class="card-label">New Regime ${newT<=oldT?'✓ Better':''}</div>
          <div class="card-value">${formatCurrency(newT)}</div>
          <div class="muted" style="font-size:0.75rem">${effNew}% effective</div>
        </div>
        <div class="card" style="${oldT<newT?"border-color:var(--c-primary);border-width:2px":""}">
          <div class="card-label">Old Regime ${oldT<newT?'✓ Better':''}</div>
          <div class="card-value">${formatCurrency(oldT)}</div>
          <div class="muted" style="font-size:0.75rem">${effOld}% effective</div>
        </div>
      </div>
      <div class="tax-highlight">
        <strong>${better} Regime saves you ${formatCurrency(saving)}</strong>
        <div class="muted" style="font-size:0.78rem;margin-top:4px">Choose the ${better} Regime for FY ${fy}</div>
      </div>
    </div>`;
};

// PDF download (basic print)
window.downloadTaxPDF = () => {
  window.print();
};
