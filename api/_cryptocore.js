// Shared crypto setup logic.
//
// Both /api/cryptosignal (one coin, full confluence) and /api/cryptoscan
// (whole market, structure only) build levels from this file. That is
// deliberate: if the scanner had its own copy, it could list a coin at one R
// multiple and the detail view could show another, and the user would have no
// way to know which to believe. One implementation, one answer.
//
// Underscore prefix keeps Vercel from routing this as an endpoint.

// Crypto prices span eight orders of magnitude (BTC ~79,000, kBONK ~0.003).
// A fixed decimal count silently destroys the small ones — rounding kBONK's ATR
// to 2dp reported it as 0. Scale the precision to the price.
export function prec(v, ref) {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.abs(ref ?? v);
  const dp = r >= 1000 ? 1 : r >= 100 ? 2 : r >= 1 ? 4 : r >= 0.01 ? 6 : 8;
  return +v.toFixed(dp);
}

export const MIN_RR = 1.5;          // the app's standing minimum
export const MIN_CONF = 45;         // below this, confluence is not there
const MIN_STOP_ATR = 1.2;           // a stop inside the noise band is stop-bait
const MAX_TARGET_ATR = 10;          // beyond this is a different timeframe's trade
const MAX_RISK_PCT = 4;             // structure too far from price to risk sensibly

// ATR(14) plus the 48h swing range, from 1h candles sorted oldest-first
export function structureFrom(candles) {
  let trSum = 0, n = 0;
  for (let i = Math.max(1, candles.length - 14); i < candles.length; i++) {
    const p = candles[i - 1], x = candles[i];
    trSum += Math.max(x.h - x.l, Math.abs(x.h - p.c), Math.abs(x.l - p.c));
    n++;
  }
  const recent = candles.slice(-48);
  return {
    atr: n ? trSum / n : null,
    swingHigh: Math.max(...recent.map(r => r.h)),
    swingLow: Math.min(...recent.map(r => r.l)),
  };
}

// Build a plan, or explain why there isn't one. `above`/`below` are candidate
// levels sorted outward from spot; pass only levels that genuinely exist in the
// market — options walls backed by open interest, or swings.
export function buildSetup({ dir, spot, atr, above, below }) {
  const isLong = dir === 'LONG';
  const protect = isLong ? below : above;
  const targets = isLong ? above : below;

  // A stop must clear structure AND clear noise. Structure alone is not enough:
  // a level sitting 0.2 ATR from spot gives a stop ordinary chop removes. Take
  // whichever is WIDER — structure plus a buffer, or the volatility floor.
  const floor = isLong ? spot - MIN_STOP_ATR * atr : spot + MIN_STOP_ATR * atr;
  const nearProtect = protect.find(l => Math.abs(l.price - spot) < 4 * atr);
  let sl, slBasis;
  if (nearProtect) {
    const structural = isLong ? nearProtect.price - 0.5 * atr : nearProtect.price + 0.5 * atr;
    if (isLong ? structural < floor : structural > floor) {
      sl = structural;
      slBasis = `${nearProtect.label} ${prec(nearProtect.price, spot)} + 0.5 ATR buffer`;
    } else {
      sl = floor;
      slBasis = `${nearProtect.label} is inside the noise band — widened to the ${MIN_STOP_ATR} ATR floor`;
    }
  } else {
    sl = isLong ? spot - 2 * atr : spot + 2 * atr;
    slBasis = 'no structure within 4 ATR — volatility stop at 2 ATR';
  }

  const risk = Math.abs(spot - sl);
  const riskPct = risk / spot * 100;
  if (risk <= 0) return { setup: null, noTrade: 'Could not derive a valid stop from current structure.' };
  if (riskPct > MAX_RISK_PCT) {
    return { setup: null, noTrade: `Stop would sit ${riskPct.toFixed(1)}% away — structure is too far from price to risk sensibly right now.` };
  }

  // Targets must be REAL levels at least 1.5R away and within reach on this
  // timeframe. If none qualifies that is a genuine no-trade, not a reason to
  // invent a number that makes the ratio work.
  const reachable = l => Math.abs(l.price - spot) <= MAX_TARGET_ATR * atr;
  const qualifying = targets.filter(l => Math.abs(l.price - spot) >= MIN_RR * risk && reachable(l));
  if (!qualifying.length) {
    const nearest = targets.filter(reachable)[0];
    return {
      setup: null,
      noTrade: nearest
        ? `Nearest level (${nearest.label} ${prec(nearest.price, spot)}) is only ${(Math.abs(nearest.price - spot) / risk).toFixed(2)}R away. No room for ${MIN_RR}:1 — skip it.`
        : 'No structural target in range to trade toward.',
    };
  }

  const tp1 = qualifying[0];
  const tp2 = qualifying[1] || null;
  return {
    noTrade: null,
    setup: {
      direction: dir,
      entry: prec(spot, spot),
      stop: prec(sl, spot),
      riskPerUnit: prec(risk, spot),
      riskPct: +riskPct.toFixed(2),
      stopBasis: slBasis,
      tp1: { price: prec(tp1.price, spot), rr: +(Math.abs(tp1.price - spot) / risk).toFixed(2), basis: tp1.label },
      tp2: tp2 ? { price: prec(tp2.price, spot), rr: +(Math.abs(tp2.price - spot) / risk).toFixed(2), basis: tp2.label } : null,
      atr: prec(atr, spot),
      management: 'Bank half at TP1 and move the stop to breakeven. Run the rest to TP2 — worst case from there is a scratch, not a loss.',
    },
  };
}

// Sort candidate levels outward from spot
export function splitLevels(entries, spot) {
  const above = [], below = [];
  for (const [price, label] of entries) {
    if (!price || !Number.isFinite(price)) continue;
    (price > spot ? above : below).push({ price: +price, label });
  }
  above.sort((a, b) => a.price - b.price);
  below.sort((a, b) => b.price - a.price);
  return { above, below };
}
