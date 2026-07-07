// ============================================================
// js/tax.js  – Indian Income Tax Calculator (FY 2025-26)
// ============================================================
import { formatCurrency, toast } from "./utils.js?v=20260705b";
import { computeCapitalGainsSummary } from "./capitalgains.js?v=20260705b";

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

  // Live capital-gains preview whenever the FY changes
  document.getElementById("tax-fy")?.addEventListener("change", renderCapGainsPreview);
  renderCapGainsPreview();
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

// ─── CAPITAL GAINS PREVIEW (auto, from actual Investments data) ──
export const renderCapGainsPreview = () => {
  const fy = document.getElementById("tax-fy")?.value || "2025-26";
  const el = document.getElementById("tax-capgains-preview");
  if (!el) return;

  const cg = computeCapitalGainsSummary(fy);

  if (cg.matchCount === 0) {
    el.innerHTML = `<div class="muted" style="font-size:0.8rem">No sales recorded in FY ${fy} yet — capital gains will appear here automatically once you sell an investment.</div>`;
    return;
  }

  const holdingsRows = cg.holdings.map(h => {
    const bucket = h.stcgGain !== 0 ? "STCG" : h.ltcgGain !== 0 ? "LTCG" : "Slab";
    return `<tr>
      <td>${h.investment.name}</td>
      <td>${h.investment.assetType}</td>
      <td>${bucket}</td>
      <td>${formatCurrency(h.charges)}</td>
      <td class="${h.netGain>=0?"positive":"negative"}">${h.netGain>=0?"+":""}${formatCurrency(h.netGain)}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="result-row"><span class="result-label">STCG Gains (Equity, ≤365 days)</span><span class="result-val">${formatCurrency(cg.stcgGains)}</span></div>
    <div class="result-row"><span class="result-label">STCG Tax @ 20%</span><span class="result-val">${formatCurrency(cg.stcgTax)}</span></div>
    <div class="result-row"><span class="result-label">LTCG Gains (Equity, &gt;365 days)</span><span class="result-val">${formatCurrency(cg.ltcgGains)}</span></div>
    <div class="result-row"><span class="result-label">LTCG Exemption Used</span><span class="result-val">${formatCurrency(Math.min(cg.ltcgGains, 125000))}</span></div>
    <div class="result-row"><span class="result-label">Taxable LTCG</span><span class="result-val">${formatCurrency(cg.ltcgTaxableBase)}</span></div>
    <div class="result-row"><span class="result-label">LTCG Tax @ 12.5%</span><span class="result-val">${formatCurrency(cg.ltcgTax)}</span></div>
    <div class="result-row"><span class="result-label">Slab-Taxed Gains (Gold/Debt/Commodity)</span><span class="result-val">${formatCurrency(cg.slabGains)}</span></div>
    <div class="tax-highlight" style="margin-top:0.5rem">
      Total Capital Gains Tax (STCG+LTCG): <strong>${formatCurrency(cg.totalCapGainsTax)}</strong>
      <div class="muted" style="font-size:0.72rem;margin-top:2px">Slab-taxed gains are added to your income below instead.</div>
    </div>
    <details style="margin-top:0.75rem">
      <summary class="muted" style="cursor:pointer;font-size:0.8rem">Which holdings contributed (${cg.holdings.length})</summary>
      <div class="inv-table-wrap" style="margin-top:0.5rem">
        <table class="inv-table">
          <thead><tr><th>Name</th><th>Type</th><th>Bucket</th><th>Charges</th><th>Net Gain</th></tr></thead>
          <tbody>${holdingsRows}</tbody>
        </table>
      </div>
      <button class="btn btn-outline btn-sm" id="tax-view-investments" style="margin-top:0.5rem">
        <i data-lucide="external-link"></i> View holding period, charges &amp; sold lots in Investments
      </button>
    </details>`;

  document.getElementById("tax-view-investments")?.addEventListener("click", () => {
    document.querySelector('.nav-item[data-page="investments"]')?.click();
  });
  lucide.createIcons();
};

// ─── MAIN CALCULATE ───────────────────────────────────────────
const calculateTax = () => {
  const fy      = document.getElementById("tax-fy").value;
  const regime  = document.querySelector('input[name="regime"]:checked')?.value || "new";
  const age     = +document.getElementById("tax-age").value || 30;
  const salary  = +document.getElementById("tax-salary").value || 0;
  const biz     = +document.getElementById("tax-business").value || 0;
  const manualCapGain = +document.getElementById("tax-capgains").value || 0; // for capital assets NOT tracked in Investments
  const other   = +document.getElementById("tax-other-income").value || 0;

  const cg = computeCapitalGainsSummary(fy);
  // Slab-taxed gains (Gold/Debt/Commodity) + any manual entry get added to
  // regular income; STCG/LTCG are taxed separately at their own flat rates
  // regardless of regime.
  const totalIncome = salary + biz + other + cg.slabGains + manualCapGain;

  const deductions = {
    c80c:     +document.getElementById("tax-80c")?.value || 0,
    c80d:     +document.getElementById("tax-80d")?.value || 0,
    hra:      +document.getElementById("tax-hra")?.value || 0,
    homeLoan: +document.getElementById("tax-homeloan")?.value || 0,
    otherDed: +document.getElementById("tax-other-ded")?.value || 0,
  };

  let result;
  if (regime === "compare") {
    const newT = addSurchargeAndCess(calcNewRegimeTax(totalIncome, age, fy), totalIncome) + cg.totalCapGainsTax;
    const { tax: oldTaxBase, taxable, totalDed } = calcOldRegimeTax(totalIncome, age, deductions);
    const oldT = addSurchargeAndCess(oldTaxBase, totalIncome) + cg.totalCapGainsTax;
    result = renderCompare({ newT, oldT, totalIncome, totalDed, taxable, age, fy, cg });
  } else if (regime === "new") {
    const baseTax = calcNewRegimeTax(totalIncome, age, fy);
    const total   = addSurchargeAndCess(baseTax, totalIncome) + cg.totalCapGainsTax;
    result = renderResult({ tax: total, totalIncome, regime: "New", standardDed: 75000, taxable: Math.max(0, totalIncome - 75000), cg });
  } else {
    const { tax: baseTax, taxable, totalDed } = calcOldRegimeTax(totalIncome, age, deductions);
    const total = addSurchargeAndCess(baseTax, totalIncome) + cg.totalCapGainsTax;
    result = renderResult({ tax: total, totalIncome, regime: "Old", totalDed, taxable, cg });
  }

  document.getElementById("tax-result-panel").innerHTML = result;
  lucide.createIcons();
};

const renderResult = ({ tax, totalIncome, regime, totalDed, standardDed, taxable, cg }) => {
  const effective = totalIncome > 0 ? (tax / totalIncome * 100).toFixed(2) : 0;
  return `
    <div class="card tax-result-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-md)">
        <h3>Tax Calculation</h3>
        <span class="tax-regime-badge">${regime} Regime</span>
      </div>
      <div class="result-row"><span class="result-label">Gross Income (incl. slab-taxed gains)</span><span class="result-val">${formatCurrency(totalIncome)}</span></div>
      <div class="result-row"><span class="result-label">Total Deductions</span><span class="result-val">${formatCurrency(totalDed||standardDed||0)}</span></div>
      <div class="result-row"><span class="result-label">Taxable Income</span><span class="result-val">${formatCurrency(taxable)}</span></div>
      <div class="result-row"><span class="result-label">Slab Tax (incl. surcharge &amp; cess)</span><span class="result-val">${formatCurrency(tax - cg.totalCapGainsTax)}</span></div>
      <div class="result-row"><span class="result-label">+ Capital Gains Tax (STCG+LTCG)</span><span class="result-val">${formatCurrency(cg.totalCapGainsTax)}</span></div>
      <div class="result-row"><span class="result-label">Effective Tax Rate</span><span class="result-val">${effective}%</span></div>
      <div class="tax-highlight">
        <div class="muted" style="font-size:0.75rem;margin-bottom:4px">Total Tax Payable</div>
        <div style="font-size:1.6rem;font-weight:700;color:var(--c-primary)">${formatCurrency(tax)}</div>
        <div class="muted" style="font-size:0.78rem;margin-top:4px">Effective rate: ${effective}%</div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="window.downloadTaxPDF()" style="margin-top:var(--sp-md)">
        <i data-lucide="download"></i> Download PDF
      </button>
    </div>`;
};

const renderCompare = ({ newT, oldT, totalIncome, totalDed, taxable, age, fy, cg }) => {
  const better    = newT <= oldT ? "New" : "Old";
  const saving    = Math.abs(newT - oldT);
  const effNew    = totalIncome > 0 ? (newT/totalIncome*100).toFixed(2) : 0;
  const effOld    = totalIncome > 0 ? (oldT/totalIncome*100).toFixed(2) : 0;
  return `
    <div class="card tax-result-card">
      <h3 style="margin-bottom:var(--sp-md)">Regime Comparison</h3>
      <div class="result-row"><span class="result-label">Gross Income (incl. slab-taxed gains)</span><span class="result-val">${formatCurrency(totalIncome)}</span></div>
      <div class="result-row"><span class="result-label">Capital Gains Tax (STCG+LTCG, same both regimes)</span><span class="result-val">${formatCurrency(cg.totalCapGainsTax)}</span></div>
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
