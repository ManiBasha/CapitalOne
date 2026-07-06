// ============================================================
// js/fifo.js – FIFO lot matching (for accurate holding period / STCG-LTCG)
//              + Indian brokerage & statutory charge calculators
// ============================================================

// ─── CHARGE DEFAULTS (editable by the user in the UI; these are just
// sensible starting points based on typical Zerodha-style delivery/
// intraday equity charges and mutual fund norms) ──────────────────
export const CHARGE_DEFAULTS = {
  equityDeliveryBuy:  { brokerage: 0,  sttPct: 0.1,   exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0.015, dpCharge: 0 },
  equityDeliverySell: { brokerage: 0,  sttPct: 0.1,   exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0,     dpCharge: 18.75 },
  equityIntradayBuy:  { brokerage: 20, brokeragePct: 0.03, sttPct: 0,     exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0.003, dpCharge: 0 },
  equityIntradaySell: { brokerage: 20, brokeragePct: 0.03, sttPct: 0.025, exchangePct: 0.00297, sebiPct: 0.0001, gstPct: 18, stampDutyPct: 0,     dpCharge: 0 },
  mfBuy:  { stampDutyPct: 0.005, expenseRatioPct: 0 },
  mfSell: { exitLoadPct: 0 },
  generic: { otherCharges: 0 },
};

// ─── CHARGE CALCULATION ───────────────────────────────────────────
// turnover = quantity * price. Returns a breakdown object + total.
export const calcEquityCharges = (turnover, side, tradeType, overrides = {}) => {
  const key = tradeType === "Intraday"
    ? (side === "buy" ? "equityIntradayBuy" : "equityIntradaySell")
    : (side === "buy" ? "equityDeliveryBuy" : "equityDeliverySell");
  const d = { ...CHARGE_DEFAULTS[key], ...overrides };

  const brokerage = d.brokeragePct !== undefined
    ? Math.min(d.brokerage || 0, (d.brokeragePct / 100) * turnover) || Math.min(20, (d.brokeragePct/100)*turnover)
    : (d.brokerage || 0);
  const stt          = (d.sttPct || 0) / 100 * turnover;
  const exchangeChg  = (d.exchangePct || 0) / 100 * turnover;
  const sebiChg       = (d.sebiPct || 0) / 100 * turnover;
  const gst           = (d.gstPct || 0) / 100 * (brokerage + exchangeChg);
  const stampDuty     = (d.stampDutyPct || 0) / 100 * turnover;
  const dpCharge      = d.dpCharge || 0;

  const total = brokerage + stt + exchangeChg + sebiChg + gst + stampDuty + dpCharge;
  return { brokerage, stt, exchangeChg, sebiChg, gst, stampDuty, dpCharge, total };
};

export const calcMFCharges = (turnover, side, overrides = {}) => {
  if (side === "buy") {
    const d = { ...CHARGE_DEFAULTS.mfBuy, ...overrides };
    const stampDuty = (d.stampDutyPct || 0) / 100 * turnover;
    return { stampDuty, expenseRatioPct: d.expenseRatioPct || 0, total: stampDuty };
  } else {
    const d = { ...CHARGE_DEFAULTS.mfSell, ...overrides };
    const exitLoad = (d.exitLoadPct || 0) / 100 * turnover;
    return { exitLoad, exitLoadPct: d.exitLoadPct || 0, total: exitLoad };
  }
};

export const calcGenericCharges = (overrides = {}) => {
  const other = overrides.otherCharges || 0;
  return { otherCharges: other, total: other };
};

// ─── FIFO MATCHING ─────────────────────────────────────────────
// buys:  [{ id, date, quantity, price, charges:{total} }]
// sells: [{ id, sellDate, quantity, sellPrice, charges:{total} }]
// Returns matched pieces (oldest buy lots consumed first) with holding
// period + realized gain net of proportional charges — the basis for
// accurate STCG/LTCG bucketing by financial year.
export const computeFIFOMatches = (buys, sells) => {
  const lots = [...buys]
    .filter(b => b.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(b => ({ ...b, remaining: b.quantity || 0 }));

  const sortedSells = [...sells].filter(s => s.sellDate).sort((a, b) => a.sellDate.localeCompare(b.sellDate));

  const matches = [];
  for (const sell of sortedSells) {
    let qtyToMatch = sell.quantity || 0;
    const sellChargeTotal = sell.charges?.total || 0;
    const sellChargePerUnit = (sell.quantity || 0) > 0 ? sellChargeTotal / sell.quantity : 0;

    for (const lot of lots) {
      if (qtyToMatch <= 0) break;
      if (lot.remaining <= 0) continue;

      const matchedQty = Math.min(lot.remaining, qtyToMatch);
      const buyChargeTotal = lot.charges?.total || 0;
      const buyChargePerUnit = (lot.quantity || 0) > 0 ? buyChargeTotal / lot.quantity : 0;

      const holdingDays = Math.round((new Date(sell.sellDate) - new Date(lot.date)) / 86400000);
      const grossGain = (sell.sellPrice - lot.price) * matchedQty;
      const chargesForMatch = (buyChargePerUnit + sellChargePerUnit) * matchedQty;
      const netGain = grossGain - chargesForMatch;

      matches.push({
        buyId: lot.id, sellId: sell.id,
        buyDate: lot.date, sellDate: sell.sellDate,
        quantity: matchedQty,
        buyPrice: lot.price, sellPrice: sell.sellPrice,
        holdingDays, isLongTerm: holdingDays > 365,
        grossGain, charges: chargesForMatch, netGain,
      });

      lot.remaining -= matchedQty;
      qtyToMatch -= matchedQty;
    }
    // If qtyToMatch > 0 here, the sell exceeds recorded buy lots (data
    // inconsistency) — silently ignore the unmatched excess rather than crash.
  }

  const remainingBuyLots = lots.filter(l => l.remaining > 0.0000001);
  return { matches, remainingBuyLots };
};
