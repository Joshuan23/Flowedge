export const config = { runtime: 'edge' };

// Crypto options — GEX, gamma walls and a real options tape, from Deribit.
//
// WHY DERIBIT ALONE IS ENOUGH: it carries roughly 85-90% of all crypto options
// open interest. For equities, reading one exchange gives you a slice of a
// fragmented market; here it is effectively the whole market.
//
// TWO THINGS THIS DOES BETTER THAN THE EQUITY TABS:
//   1. The tape carries aggressor direction. /api/optionsflow has to infer
//      intent from volume-vs-open-interest because sweep/block and bid/ask
//      classification needs a paid OPRA feed. Deribit publishes the side.
//   2. Every contract carries its own mark IV, so each strike prices with its
//      own vol instead of one estimate smeared across the chain.
//
// ONE THING IT DOES WORSE, AND IT MATTERS: the dealer-positioning assumption is
// weaker. Equity GEX leans on dealers being short customer options. In crypto a
// large share of open interest is miners and treasuries selling covered calls,
// plus systematic vol-selling vaults — so the sign convention is genuinely less
// reliable here and the UI labels it as an assumption, not an observation.

const DERIBIT = 'https://www.deribit.com/api/v2/public';
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function normalPDF(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

// Same Black-Scholes gamma as the equity engines, so the two are comparable.
// Deribit does publish greeks, but only on the per-instrument ticker endpoint —
// one request per contract, ~900 contracts. Computing from the published mark
// IV gets the same number in a single request.
function bsGamma(S, K, T, sigma, r = 0) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

// Cumulative normal, for delta. Abramowitz-Stegun 7.1.26 — accurate to ~1e-7,
// which is far tighter than the input IV is anyway.
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = normalPDF(x);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function bsDelta(S, K, T, sigma, isCall) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return isCall ? 0.5 : -0.5;
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  return isCall ? normalCDF(d1) : normalCDF(d1) - 1;
}

// BTC-25SEP26-80000-C  ->  { K: 80000, isCall: true, expMs }
function parseInstrument(name) {
  const m = /^[A-Z]+-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])$/.exec(name);
  if (!m) return null;
  const mo = MONTHS[m[2]];
  if (mo == null) return null;
  // Deribit settles at 08:00 UTC on the expiry date
  return { K: Number(m[4]), isCall: m[5] === 'C', expMs: Date.UTC(2000 + Number(m[3]), mo, Number(m[1]), 8) };
}

export default async function handler(req) {
  const url = new URL(req.url);
  const ccy = (url.searchParams.get('currency') || 'BTC').toUpperCase();
  if (ccy !== 'BTC' && ccy !== 'ETH') {
    // Checked live: SOL and XRP return zero listed option instruments. Saying so
    // is better than returning an empty chain that looks like a bug.
    return json({ error: `${ccy} has no listed options market. Deribit lists BTC and ETH only.`, currency: ccy }, 404);
  }

  try {
    const [summaryRes, tradesRes, indexRes] = await Promise.all([
      fetch(`${DERIBIT}/get_book_summary_by_currency?currency=${ccy}&kind=option`),
      fetch(`${DERIBIT}/get_last_trades_by_currency?currency=${ccy}&kind=option&count=100`),
      fetch(`${DERIBIT}/get_index_price?index_name=${ccy.toLowerCase()}_usd`),
    ]);
    if (!summaryRes.ok) return json({ error: `Deribit HTTP ${summaryRes.status}`, currency: ccy }, summaryRes.status);

    const rows  = (await summaryRes.json())?.result || [];
    const spot  = (await indexRes.json())?.result?.index_price;
    const trades = (tradesRes.ok ? (await tradesRes.json())?.result?.trades : []) || [];
    if (!spot) return json({ error: 'No index price', currency: ccy }, 502);

    const now = Date.now();
    const byStrike = new Map();
    const byExpiry = new Map();
    const payoutStrikes = new Set();
    const allContracts = [];
    const book = [];
    const expirySet = new Set();
    let callOI = 0, putOI = 0, callVol = 0, putVol = 0, oiUsd = 0;

    for (const r of rows) {
      const inst = parseInstrument(r.instrument_name);
      if (!inst) continue;
      const oi = Number(r.open_interest) || 0;
      const vol = Number(r.volume) || 0;
      const iv = (Number(r.mark_iv) || 0) / 100;
      if (inst.isCall) { callOI += oi; callVol += vol; } else { putOI += oi; putVol += vol; }
      expirySet.add(inst.expMs);
      if (oi <= 0 || iv <= 0) continue;
      allContracts.push({ K: inst.K, isCall: inst.isCall, oi });
      // ±40% band. Equities use ±15%, but crypto ladders run far wider (BTC
      // lists 30k through 155k) and the deep OTM puts are exactly what drives
      // negative gamma below spot — cutting at ±25% moved the computed flip by
      // ~2000 points, so the wings genuinely matter here.
      if (Math.abs(inst.K - spot) / spot > 0.40) continue;

      const dte = Math.max(0.5, (inst.expMs - now) / 86400000);
      const T = dte / 365;
      // Same short-dated discount as the equity engines: 0DTE gamma is enormous
      // but decays within hours, so one expiry cannot dominate the profile
      const w = dte < 1 ? 0.25 : dte < 3 ? 0.6 : dte < 7 ? 0.85 : 1.0;

      // Deribit BTC/ETH options are coin-margined: one contract is one coin, and
      // open_interest is denominated in the coin. Dollar gamma per 1% move is
      // therefore gamma * S^2 * 1% * OI, with no 100x contract multiplier.
      const g = bsGamma(spot, inst.K, T, iv) * spot * spot * 0.01 * w;
      const gex = g * oi;
      oiUsd += oi * spot;

      book.push({ K: inst.K, T, sigma: iv, oi, isCall: inst.isCall, w });
      // Per-expiry contracts, for term structure and 25-delta skew
      if (!byExpiry.has(inst.expMs)) byExpiry.set(inst.expMs, []);
      byExpiry.get(inst.expMs).push({ K: inst.K, isCall: inst.isCall, iv, oi, T });
      // Every strike with OI feeds max pain, including outside the gamma band
      payoutStrikes.add(inst.K);
      if (!byStrike.has(inst.K)) byStrike.set(inst.K, { strike: inst.K, callOI: 0, putOI: 0, callGex: 0, putGex: 0, gex: 0 });
      const s = byStrike.get(inst.K);
      if (inst.isCall) { s.callOI += oi; s.callGex += gex; s.gex += gex; }
      else             { s.putOI  += oi; s.putGex  += gex; s.gex -= gex; }
    }

    const gexByStrike = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
    if (!gexByStrike.length) return json({ error: 'No strikes in range', currency: ccy, spot }, 404);

    const netGex    = gexByStrike.reduce((s, x) => s + x.gex, 0);
    const gammaWall = gexByStrike.reduce((m, x) => x.gex > m.gex ? x : m).strike;
    const callWall  = gexByStrike.filter(x => x.strike >= spot && x.callOI > 0)
      .reduce((m, x) => x.callOI > m.callOI ? x : m, { callOI: 0, strike: null }).strike;
    const putWall   = gexByStrike.filter(x => x.strike <= spot && x.putOI > 0)
      .reduce((m, x) => x.putOI > m.putOI ? x : m, { putOI: 0, strike: null }).strike;

    // Gamma flip: the spot at which dealer net gamma changes sign, found by
    // re-pricing the whole book at candidate spots and bisecting. Same method as
    // the equity engines — walking cumulative GEX across strikes is a different
    // quantity and frequently never crosses.
    const netGexAt = (S) => {
      let t = 0;
      for (const c of book) {
        const g = bsGamma(S, c.K, c.T, c.sigma) * S * S * 0.01 * c.w * c.oi;
        t += c.isCall ? g : -g;
      }
      return t;
    };
    let flipLevel = null;
    {
      // ±35%. Crypto sits far deeper in positive gamma than equities, so the
      // flip is often 10-15% below spot; a ±15% scan missed BTC's entirely.
      const lo = spot * 0.65, hi = spot * 1.35, steps = 120;
      let prevS = lo, prevV = netGexAt(lo);
      for (let i = 1; i <= steps; i++) {
        const S = lo + (hi - lo) * (i / steps);
        const v = netGexAt(S);
        if ((prevV < 0 && v >= 0) || (prevV > 0 && v <= 0)) {
          let a = prevS, b = S, fa = prevV;
          for (let k = 0; k < 40; k++) {
            const m = (a + b) / 2, fm = netGexAt(m);
            if ((fa < 0 && fm >= 0) || (fa > 0 && fm <= 0)) b = m; else { a = m; fa = fm; }
          }
          flipLevel = +((a + b) / 2).toFixed(0);
          break;
        }
        prevS = S; prevV = v;
      }
    }

    // ---- Max pain ----
    // The strike where option holders collectively receive the least. It is not
    // a prediction — it is where the writers' book is cheapest to settle, and it
    // acts as a weak magnet into expiry, strongest on large quarterly dates.
    let maxPain = null, minPayout = Infinity;
    for (const K of payoutStrikes) {
      let payout = 0;
      for (const c of allContracts) {
        payout += c.isCall ? Math.max(0, K - c.K) * c.oi : Math.max(0, c.K - K) * c.oi;
      }
      if (payout < minPayout) { minPayout = payout; maxPain = K; }
    }

    // ---- IV term structure and 25-delta skew, per expiry ----
    // Skew is the cleanest fear gauge options give: puts bid over calls means
    // demand for downside protection. Term structure inverting (front above
    // back) is the market pricing near-term stress.
    const termStructure = [];
    for (const [expMs, contracts] of [...byExpiry.entries()].sort((a, b) => a[0] - b[0])) {
      const dte = (expMs - now) / 86400000;
      if (dte < 0.2) continue;
      // ATM IV: the contract whose strike sits closest to spot
      let atm = null, best = Infinity;
      for (const c of contracts) {
        const d = Math.abs(c.K - spot);
        if (d < best) { best = d; atm = c; }
      }
      // 25-delta put and call: nearest to |delta| = 0.25 on each side
      let p25 = null, c25 = null, pBest = Infinity, cBest = Infinity;
      for (const c of contracts) {
        const dl = Math.abs(bsDelta(spot, c.K, c.T, c.iv, c.isCall));
        const gap = Math.abs(dl - 0.25);
        if (c.isCall) { if (gap < cBest) { cBest = gap; c25 = c; } }
        else          { if (gap < pBest) { pBest = gap; p25 = c; } }
      }
      termStructure.push({
        expiry: new Date(expMs).toISOString().slice(0, 10),
        dte: +dte.toFixed(1),
        atmIv: atm ? +(atm.iv * 100).toFixed(1) : null,
        // Positive skew = puts more expensive than calls = downside demand
        skew25: p25 && c25 ? +((p25.iv - c25.iv) * 100).toFixed(1) : null,
        contracts: contracts.length,
      });
    }

    const front = termStructure[0] || null;
    const back  = termStructure[termStructure.length - 1] || null;
    const termShape = front && back && front.atmIv != null && back.atmIv != null
      ? (front.atmIv > back.atmIv + 1 ? 'BACKWARDATION' : back.atmIv > front.atmIv + 1 ? 'CONTANGO' : 'FLAT')
      : null;

    // ---- The tape. Deribit gives the aggressor side outright. ----
    let buyPrem = 0, sellPrem = 0;
    const flow = [];
    for (const t of trades) {
      const inst = parseInstrument(t.instrument_name);
      if (!inst) continue;
      const amount = Number(t.amount) || 0;
      // price is the premium quoted in coin; premium USD is what changed hands,
      // notional USD is the underlying exposure the contracts represent
      const premiumUsd  = amount * Number(t.price) * spot;
      const notionalUsd = amount * spot;
      if (t.direction === 'buy') buyPrem += premiumUsd; else sellPrem += premiumUsd;
      flow.push({
        ts: t.timestamp,
        instrument: t.instrument_name,
        type: inst.isCall ? 'CALL' : 'PUT',
        strike: inst.K,
        expiry: new Date(inst.expMs).toISOString().slice(0, 10),
        direction: t.direction === 'buy' ? 'BUY' : 'SELL',
        amount, iv: Number(t.iv) || null,
        premiumUsd: Math.round(premiumUsd),
        notionalUsd: Math.round(notionalUsd),
        moneyness: +((inst.K - spot) / spot * 100).toFixed(1),
      });
    }
    const byPremium = flow.slice().sort((a, b) => b.premiumUsd - a.premiumUsd);

    return json({
      currency: ccy, spot,
      netGex, gammaWall, callWall, putWall, flipLevel,
      gexByStrike: gexByStrike.map(x => ({ ...x, gex: Math.round(x.gex), callGex: Math.round(x.callGex), putGex: Math.round(x.putGex) })),
      totals: {
        callOI: +callOI.toFixed(1), putOI: +putOI.toFixed(1),
        pcOI: callOI > 0 ? +(putOI / callOI).toFixed(2) : null,
        callVol: +callVol.toFixed(1), putVol: +putVol.toFixed(1),
        pcVol: callVol > 0 ? +(putVol / callVol).toFixed(2) : null,
        oiUsd: Math.round(oiUsd),
        expiries: expirySet.size,
        instruments: rows.length,
      },
      maxPain,
      termStructure, termShape,
      frontSkew: front?.skew25 ?? null,
      flow: flow.slice(0, 30),
      topFlow: byPremium.slice(0, 12),
      flowTotals: {
        buyPremium: Math.round(buyPrem),
        sellPremium: Math.round(sellPrem),
        buyShare: buyPrem + sellPrem > 0 ? +(buyPrem / (buyPrem + sellPrem) * 100).toFixed(1) : null,
        count: flow.length,
        windowMs: flow.length ? flow[0].ts - flow[flow.length - 1].ts : 0,
      },
      source: 'Deribit — ~85-90% of crypto options open interest. Tape carries true aggressor direction.',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message, currency: ccy }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=20, stale-while-revalidate=20',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
