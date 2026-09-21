export const config = { runtime: 'edge' };

// Stock trade setups — entry, stop and targets from dealer positioning, options
// flow, dark pool levels and price structure.
//
// SAME HONESTY AS THE CRYPTO ENGINE: this is a RULES ENGINE, NOT A BACKTESTED
// EDGE. The FX strategies in this app had to survive walk-forward out-of-sample
// testing and several were rejected on it. This cannot be tested that way —
// free historical GEX, options-flow and dark-pool series do not exist — so the
// combination is unproven even though each read is individually well founded.
//
// WHY STOCKS GET BETTER LEVELS THAN CRYPTO: an options chain gives real,
// open-interest-backed structure — call wall, put wall, gamma wall, gamma flip,
// king nodes — where most crypto perps only offer swing highs and lows. Two
// independent GEX engines run here (NASDAQ via /api/gamma, Yahoo via
// /api/gex2), so a level both agree on can be marked CONFIRMED and preferred
// for stops and targets. That cross-check does not exist anywhere else in the
// app.
//
// TIMEFRAME: daily ATR and 20-day structure, so these are multi-day swings, not
// intraday scalps. The setup bounds are passed explicitly rather than
// inheriting the crypto engine's 1h-ATR numbers.

import { prec, buildSetup, splitLevels, MIN_CONF } from './_cryptocore.js';

// Equity bounds: daily ATR over a multi-day hold
const STOCK_BOUNDS = { minStopAtr: 1.0, maxTargetAtr: 6, maxRiskPct: 5 };

const jget = async (u) => {
  try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; }
};

export default async function handler(req) {
  const url    = new URL(req.url);
  const origin = url.origin;
  const symbol = (url.searchParams.get('symbol') || 'SPY').toUpperCase();

  try {
    const [gam, gex2, flow, dark, chart] = await Promise.all([
      jget(`${origin}/api/gamma?symbol=${symbol}`),
      jget(`${origin}/api/gex2?symbol=${symbol}&expiries=4`),
      jget(`${origin}/api/optionsflow?symbol=${symbol}`),
      jget(`${origin}/api/darkpool?symbol=${symbol}`),
      jget(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`),
    ]);

    if (!gam || gam.error) {
      return json({ error: gam?.error || `No options chain for ${symbol} — this engine needs one`, symbol }, 404);
    }
    const spot = gam.spot;
    if (!spot) return json({ error: 'No spot price', symbol }, 404);

    // ---- Structure from daily candles ----
    const q = chart?.chart?.result?.[0];
    const closes = q?.indicators?.quote?.[0]?.close || [];
    const highs  = q?.indicators?.quote?.[0]?.high  || [];
    const lows   = q?.indicators?.quote?.[0]?.low   || [];
    const n = closes.length;
    let swingHigh = null, swingLow = null;
    if (n >= 20) {
      const hs = highs.slice(-20).filter(Number.isFinite);
      const ls = lows.slice(-20).filter(Number.isFinite);
      if (hs.length) swingHigh = Math.max(...hs);
      if (ls.length) swingLow  = Math.min(...ls);
    }
    // gamma.js already computes ATR(14) on daily bars
    const atr = Number(gam.atr14) || spot * 0.015;

    // ---- Factors. Each is listed with its contribution so the score is
    // auditable rather than a black box. ----
    const factors = [];
    const add = (name, score, detail) => factors.push({ name, score: +score.toFixed(2), detail });

    // Track which inputs were actually AVAILABLE, not just which ones scored.
    // Outside market hours option volume is zero, so three of the six factors
    // cannot fire at all — and a confluence number that does not say so reads
    // as "no signal" when the truth is "half the instruments are dark".
    let maxAvailable = 0;
    const avail = (w, present) => { if (present) maxAvailable += w; };

    // Dealer positioning is the anchor read, the way open interest is in crypto
    const bias = Number(gam.biasScore);
    avail(2.0, Number.isFinite(bias));
    if (Number.isFinite(bias) && Math.abs(bias) > 0.05) {
      add(`Dealer GEX bias ${bias > 0 ? '+' : ''}${bias.toFixed(2)}`, bias * 2,
        bias > 0 ? 'Net dealer gamma leans long above spot — hedging flow supports rallies'
                 : 'Net dealer gamma leans short — hedging flow pressures rallies');
    }

    avail(0.5, !!gam.flipLevel);
    if (gam.flipLevel) {
      const above = spot > gam.flipLevel;
      add(`${above ? 'Above' : 'Below'} gamma flip ${prec(gam.flipLevel, spot)}`, above ? 0.5 : -0.5,
        above ? 'Positive gamma — dealer hedging dampens moves, extremes tend to fade'
              : 'Negative gamma — dealer hedging amplifies moves, the regime that trends and gaps');
    }

    // Premium committed today is a cleaner directional read than contract count
    const cps = flow?.totals?.callPremiumShare;
    avail(1.0, cps != null);
    if (cps != null) {
      const s = cps > 62 ? 1.0 : cps > 55 ? 0.5 : cps < 38 ? -1.0 : cps < 45 ? -0.5 : 0;
      if (s !== 0) add(`Call premium share ${cps}%`, s, 'Share of option dollars committed to calls rather than puts today');
    }

    // Contracts trading above their entire standing open interest are new
    // positioning, not inventory being shuffled
    avail(0.75, !!flow?.unusual?.length);
    if (flow?.unusual?.length) {
      let cN = 0, pN = 0;
      for (const f of flow.unusual) { if (f.type === 'CALL') cN += f.notional; else pN += f.notional; }
      const tot = cN + pN;
      if (tot > 0) {
        const share = cN / tot;
        const s = share > 0.7 ? 0.75 : share > 0.58 ? 0.4 : share < 0.3 ? -0.75 : share < 0.42 ? -0.4 : 0;
        if (s !== 0) add(`Unusual activity ${Math.round(share * 100)}% calls`, s,
          `${flow.unusual.length} contracts trading above their open interest — new positioning`);
      }
    }

    // P/C volume, contrarian at the extremes. Null before the open.
    const pc = flow?.totals?.pcVolume ?? (gam.pcVolumeRatio != null ? Number(gam.pcVolumeRatio) : null);
    avail(0.6, pc != null && pc > 0);
    if (pc != null && pc > 0) {
      const s = pc > 1.4 ? 0.6 : pc > 1.15 ? 0.3 : pc < 0.6 ? -0.6 : pc < 0.85 ? -0.3 : 0;
      if (s !== 0) add(`Put/call volume ${pc}`, s, s > 0 ? 'Heavy put buying — contrarian positive at extremes' : 'Heavy call buying — contrarian negative at extremes');
    }

    // Dark pool: where institutions actually transacted size. Weighted lightly
    // because FINRA publishes it with a multi-week lag.
    const dpLevel = dark?.levels?.length ? dark.levels[dark.levels.length - 1] : null;
    avail(0.4, !!dpLevel?.price);
    if (dpLevel?.price) {
      const distPct = (spot - dpLevel.price) / spot * 100;
      const s = distPct > 1 ? 0.4 : distPct < -1 ? -0.4 : 0;
      if (s !== 0) add(`${distPct > 0 ? 'Above' : 'Below'} dark pool ${prec(dpLevel.price, spot)}`, s,
        `Institutional size traded there in week of ${dpLevel.week}, published ${dark.lagDays}d late — a reference level, not a live one`);
    }

    const rawScore = factors.reduce((s, f) => s + f.score, 0);
    const maxScore = 5.25;
    // Normalised against the FULL factor set, deliberately: missing data should
    // lower confidence rather than be papered over by rescaling to whatever
    // happens to be available. maxAvailable is reported alongside so the UI can
    // distinguish "the reads disagree" from "the reads are not in yet".
    const confidence = Math.min(100, Math.round(Math.abs(rawScore) / maxScore * 100));
    const confidenceCeiling = Math.round(maxAvailable / maxScore * 100);
    const dir = rawScore > 0 ? 'LONG' : 'SHORT';

    // ---- Levels. Two independent GEX engines means a level both agree on can
    // be marked confirmed — a cross-check nothing else in the app has. ----
    const agree = (a, b) => a != null && b != null && Math.abs(a - b) / spot <= 0.005;
    const confirmedWalls = {
      gammaWall: agree(gam.gammaWall, gex2?.gammaWall),
      callWall:  agree(gam.callWall,  gex2?.callWall),
      putWall:   agree(gam.putWall,   gex2?.putWall),
      flipLevel: agree(gam.flipLevel, gex2?.flipLevel),
    };
    const tag = (label, confirmed) => confirmed ? `${label} ✓confirmed` : label;

    const entries = [
      [gam.callWall,  tag('call wall', confirmedWalls.callWall)],
      [gam.putWall,   tag('put wall', confirmedWalls.putWall)],
      [gam.gammaWall, tag('gamma wall', confirmedWalls.gammaWall)],
      [gam.flipLevel, tag('gamma flip', confirmedWalls.flipLevel)],
      [gam.buyKingNode?.strike,  'buy king node'],
      [gam.sellKingNode?.strike, 'sell king node'],
      [swingHigh, '20d swing high'],
      [swingLow,  '20d swing low'],
    ];
    if (dpLevel?.price) entries.push([dpLevel.price, `dark pool ${dpLevel.week}`]);
    const { above, below } = splitLevels(entries, spot);

    let setup = null, noTrade = null;
    if (confidence < MIN_CONF) {
      noTrade = `Confluence only ${confidence}%. The inputs disagree or are flat — no setup worth risking capital on.`;
    } else {
      ({ setup, noTrade } = buildSetup({ dir, spot, atr, above, below, ...STOCK_BOUNDS }));
    }

    return json({
      symbol, spot, confidence, confidenceCeiling, direction: dir, rawScore: +rawScore.toFixed(2),
      factors, setup, noTrade,
      levels: { above: above.slice(0, 6), below: below.slice(0, 6), atr: prec(atr, spot), swingHigh: prec(swingHigh, spot), swingLow: prec(swingLow, spot) },
      context: {
        netGex: gam.netGex, gammaWall: gam.gammaWall, callWall: gam.callWall,
        putWall: gam.putWall, flipLevel: gam.flipLevel, biasScore: bias,
        impliedVol: gam.impliedVol, pcVolume: pc,
        callPremiumShare: cps ?? null,
        unusualCount: flow?.unusual?.length ?? 0,
        darkPool: dpLevel ? { price: dpLevel.price, week: dpLevel.week, lagDays: dark.lagDays } : null,
        confirmedWalls,
        confirmedCount: Object.values(confirmedWalls).filter(Boolean).length,
        gex2Available: !!gex2 && !gex2.error,
      },
      coverage: {
        flow: !!flow && !flow.error,
        darkPool: !!dpLevel,
        secondGex: !!gex2 && !gex2.error,
        structure: swingHigh != null,
        note: flow?.totals?.pcVolume == null
          ? `Option volume is zero — outside market hours the flow factors cannot fire, capping confluence at ${confidenceCeiling}%.`
          : (!gex2 || gex2.error)
            ? 'Second GEX source unavailable, so no level could be cross-confirmed this run.'
            : null,
      },
      validated: false,
      disclaimer: 'Rules engine, not a backtested edge. Free historical GEX, options-flow and dark-pool series do not exist, so this could not be walk-forward tested the way the FX strategies in this app were. Track it forward before sizing up.',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message, symbol }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
