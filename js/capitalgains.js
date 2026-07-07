// ============================================================
// js/capitalgains.js – Capital Gains Tax Engine
// ============================================================
// Rules (as specified):
//   Equity / Equity Mutual Fund:
//     Holding <= 365 days  -> STCG, tax = profit * 20%
//     Holding >  365 days  -> LTCG, tax = MAX(0, FY LTCG - 125000) * 12.5%
//   Gold ETF / Gold Mutual Fund / Commodity / Debt Mutual Fund / other:
//     Taxed at the applicable income tax slab rate (added to "other income"
//     for the slab calculator in tax.js to handle).
import { getAllFIFOMatches } from "./investments.js?v=20260705b";

export const LTCG_EXEMPTION = 125000;
export const STCG_RATE = 0.20;
export const LTCG_RATE = 0.125;

// fyValue: "2025-26" style (matches the <select id="tax-fy"> values)
export const fyToRange = (fyValue) => {
  const y = parseInt(fyValue.split("-")[0]);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
};

const isEquityTaxed = (inv) => {
  if (inv.assetType === "Equity") return true;
  if (inv.assetType === "Mutual Fund") return (inv.taxCategory || "equity") === "equity";
  return inv.taxCategory === "equity"; // custom asset types explicitly marked equity-like
};

export const computeCapitalGainsSummary = (fyValue) => {
  const { from, to } = fyToRange(fyValue);
  const allMatches = getAllFIFOMatches().filter(m => m.sellDate >= from && m.sellDate <= to);

  const equityMatches = allMatches.filter(m => isEquityTaxed(m.investment));
  const slabMatches    = allMatches.filter(m => !isEquityTaxed(m.investment));

  const stcgMatches = equityMatches.filter(m => !m.isLongTerm);
  const ltcgMatches = equityMatches.filter(m => m.isLongTerm);

  const stcgGains = stcgMatches.reduce((s, m) => s + m.netGain, 0);
  const ltcgGains = ltcgMatches.reduce((s, m) => s + m.netGain, 0);
  const slabGains = slabMatches.reduce((s, m) => s + m.netGain, 0);

  const stcgTax = Math.max(0, stcgGains) * STCG_RATE;
  const ltcgTaxableBase = Math.max(0, ltcgGains - LTCG_EXEMPTION);
  const ltcgTax = ltcgTaxableBase * LTCG_RATE;

  // Per-holding breakdown for the "link back to holdings" requirement
  const byHolding = {};
  allMatches.forEach(m => {
    const key = m.investment.id;
    if (!byHolding[key]) {
      byHolding[key] = {
        investment: m.investment, netGain: 0, charges: 0,
        stcgGain: 0, ltcgGain: 0, slabGain: 0, matches: []
      };
    }
    const bucket = byHolding[key];
    bucket.netGain += m.netGain;
    bucket.charges += m.charges;
    bucket.matches.push(m);
    if (isEquityTaxed(m.investment)) {
      if (m.isLongTerm) bucket.ltcgGain += m.netGain; else bucket.stcgGain += m.netGain;
    } else {
      bucket.slabGain += m.netGain;
    }
  });

  return {
    fyValue, from, to,
    stcgGains, ltcgGains, slabGains,
    stcgTax, ltcgTax, ltcgTaxableBase,
    totalCapGainsTax: stcgTax + ltcgTax,
    holdings: Object.values(byHolding).sort((a, b) => Math.abs(b.netGain) - Math.abs(a.netGain)),
    matchCount: allMatches.length,
  };
};
