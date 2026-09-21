export const config = { runtime: 'edge' };

// Crypto trade setups — one entry, stop and targets, built from every other
// crypto data source in the app rather than from price patterns.
//
// READ THIS BEFORE TRADING IT: this is a RULES ENGINE, NOT A BACKTESTED EDGE.
// Everywhere else in this app a strategy has to survive walk-forward
// out-of-sample testing before it is allowed to gate anything, and several
// candidates were rejected on exactly that basis. This one cannot be tested
// that way: free historical series for open interest, funding, GEX and skew do
// not exist, so there is no honest way to simulate it. What it does is combine
// reads that are individually well-founded into an explicit, disciplined plan.
// Treat it as a structured checklist, not as a validated signal, and track it
// forward before sizing up.
//
// TWO PRINCIPLES DRIVE THE LEVELS:
//   1. Stops go beyond STRUCTURE, not at an arbitrary percentage. Structure
//      here means a real level — an options wall backed by open interest, or a
//      48h swing — with an ATR buffer so noise does not take you out.
//   2. Targets must be REACHABLE LEVELS, not multiples invented to hit a ratio.
//      If no genuine level sits 1.5R away, that is a no-trade, and the engine
//      says so instead of inventing a target to make the math work.

import { prec, structureFrom, buildSetup, splitLevels, MIN_CONF } from './_cryptocore.js';

const OKX = 'https://www.okx.com/api/v5';

const jget = async (u) => {
  try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; }
};

const hlPost = async (body) => {
  try {
    const r = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

export default async function handler(req) {
  const url    = new URL(req.url);
  const origin = url.origin;
  // Hyperliquid names are case-SENSITIVE (kBONK, kPEPE, kFLOKI), so the coin is
  // passed through verbatim; only the venues that expect uppercase get it
  // uppercased.
  const coin   = url.searchParams.get('coin') || 'BTC';
  const CCY    = coin.toUpperCase();
  const hasOptions = CCY === 'BTC' || CCY === 'ETH';

  try {
    const [edge, opts, book, flow, candleRes] = await Promise.all([
      jget(`${origin}/api/cryptoedge?coin=${CCY}`),
      hasOptions ? jget(`${origin}/api/cryptooptions?currency=${CCY}`) : Promise.resolve(null),
      jget(`${origin}/api/orderbook?coin=${encodeURIComponent(coin)}`),
      jget(`${origin}/api/cryptoflow?coin=${encodeURIComponent(coin)}`),
      // Hyperliquid candles rather than OKX: they cover every listed perp,
      // including names OKX does not carry (kBONK, FARTCOIN, GRASS...), so the
      // structure half of this engine works across the whole universe even when
      // the OKX positioning half does not.
      hlPost({ type: 'candleSnapshot', req: { coin, interval: '1h', startTime: Date.now() - 100 * 3600000, endTime: Date.now() } }),
    ]);

    const candles = (Array.isArray(candleRes) ? candleRes : []).map(r => ({
      t: +r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c,
    })).filter(r => r.c > 0).sort((a, b) => a.t - b.t);
    if (candles.length < 30) return json({ error: `No price history for ${coin}`, coin }, 404);

    const spot = book?.mid || edge?.openInterest?.priceNow || candles[candles.length - 1].c;

    // ATR(14) and the 48h swing range — shared with the market scanner so both
    // measure structure identically
    const st = structureFrom(candles);
    const atr = st.atr || spot * 0.005;
    const { swingHigh, swingLow } = st;

    // ---- Directional score. Every factor is listed with its contribution so
    // the number is auditable rather than a black box. ----
    const factors = [];
    const add = (name, score, detail) => { if (score !== 0 || detail) factors.push({ name, score: +score.toFixed(2), detail }); };

    const oiR = edge?.openInterest;
    if (oiR?.regime) {
      const m = {
        'NEW LONGS':        [ 2.0, 'Fresh money buying — the healthiest trend structure'],
        'NEW SHORTS':       [-2.0, 'Fresh money selling — genuine bearish conviction'],
        'SHORT COVERING':   [ 1.0, 'Up on FALLING open interest — a squeeze, not accumulation. Fades when shorts finish'],
        'LONG LIQUIDATION': [-1.0, 'Down on FALLING open interest — forced selling that exhausts itself'],
        'NEUTRAL':          [ 0.0, 'No regime — open interest and price both flat'],
      }[oiR.regime];
      if (m) add(`Open interest: ${oiR.regime}`, m[0], m[1]);
    }

    // Funding is contrarian: whoever is PAYING to hold is the crowded side, and
    // crowded sides are what get liquidated
    const fundingApr = (flow?.markets || []).find(m => m.coin === coin)?.fundingApr ?? null;
    if (fundingApr != null) {
      const s = fundingApr > 30 ? -1.5 : fundingApr > 15 ? -0.75 : fundingApr < -30 ? 1.5 : fundingApr < -15 ? 0.75 : 0;
      if (s !== 0) add(`Funding ${fundingApr > 0 ? '+' : ''}${fundingApr.toFixed(1)}% APR`, s,
        s < 0 ? 'Longs are paying shorts to hold — crowded long, contrarian negative'
              : 'Shorts are paying longs to hold — crowded short, contrarian positive');
    }

    const lsRatio = edge?.positioning?.longShortRatio ?? null;
    if (lsRatio != null) {
      const s = lsRatio > 1.6 ? -1.2 : lsRatio > 1.3 ? -0.6 : lsRatio < 0.75 ? 1.2 : lsRatio < 0.9 ? 0.6 : 0;
      if (s !== 0) add(`Accounts long/short ${lsRatio}`, s, s < 0 ? 'Crowded long — contrarian negative' : 'Crowded short — contrarian positive');
    }

    const buyShare = edge?.takerFlow?.buyShare ?? null;
    if (buyShare != null) {
      const s = buyShare > 55 ? 1.0 : buyShare > 52 ? 0.5 : buyShare < 45 ? -1.0 : buyShare < 48 ? -0.5 : 0;
      if (s !== 0) add(`Taker flow ${buyShare}% bought`, s, 'Who crossed the spread rather than resting an order');
    }

    if (book && Number.isFinite(book.imbalance)) {
      const s = book.imbalance > 25 ? 0.75 : book.imbalance > 12 ? 0.4 : book.imbalance < -25 ? -0.75 : book.imbalance < -12 ? -0.4 : 0;
      if (s !== 0) add(`Book imbalance ${book.imbalance.toFixed(0)}%`, s, 'Resting depth skew — weakest input here, it can be pulled instantly');
    }

    if (opts?.flipLevel && spot) {
      const above = spot > opts.flipLevel;
      add(`${above ? 'Above' : 'Below'} gamma flip ${opts.flipLevel.toLocaleString()}`, above ? 0.5 : -0.5,
        above ? 'Positive gamma — moves get dampened, extremes tend to fade'
              : 'Negative gamma — moves get amplified, the regime that trends');
    }

    const rawScore = factors.reduce((s, f) => s + f.score, 0);
    const maxScore = 6.95;   // sum of all positive weights, for normalising
    const confidence = Math.min(100, Math.round(Math.abs(rawScore) / maxScore * 100));
    const dir = rawScore > 0 ? 'LONG' : 'SHORT';

    // ---- Candidate levels: only things that actually exist in the market ----
    const above = [], below = [];
    const push = (arr, price, label) => {
      if (price && Number.isFinite(price)) arr.push({ price: +price, label });
    };
    if (opts) {
      push(opts.callWall  > spot ? above : below, opts.callWall,  'call wall (largest call OI)');
      push(opts.putWall   > spot ? above : below, opts.putWall,   'put wall (largest put OI)');
      push(opts.gammaWall > spot ? above : below, opts.gammaWall, 'gamma wall (magnet)');
      push(opts.maxPain   > spot ? above : below, opts.maxPain,   'max pain');
    }
    push(above, swingHigh, '48h swing high');
    push(below, swingLow,  '48h swing low');

    // Order-book walls are deliberately NOT structure for stops or targets.
    // They routinely sit within a few dollars of spot, which produced a 0.20%
    // BTC stop and a 34R target when they were included — and they can be
    // cancelled in an instant, which is precisely what a stop must not depend
    // on. They stay in the payload as context only.
    const bookWalls = [];
    if (book?.askWalls?.length) bookWalls.push({ price: book.askWalls[0].px, label: 'book ask wall', side: 'above' });
    if (book?.bidWalls?.length) bookWalls.push({ price: book.bidWalls[0].px, label: 'book bid wall', side: 'below' });

    above.sort((a, b) => a.price - b.price);
    below.sort((a, b) => b.price - a.price);

    // ---- Build the plan ----
    // Stop and target rules live in _cryptocore so the whole-market scanner and
    // this detail view can never report different levels for the same coin.
    let setup = null, noTrade = null;
    if (confidence < MIN_CONF) {
      noTrade = `Confluence only ${confidence}%. The inputs disagree or are flat — no setup worth risking capital on.`;
    } else {
      ({ setup, noTrade } = buildSetup({ dir, spot, atr, above, below }));
    }

    return json({
      coin, spot, confidence, direction: dir, rawScore: +rawScore.toFixed(2),
      factors, setup, noTrade,
      levels: { above: above.slice(0, 5), below: below.slice(0, 5), bookWalls, atr: prec(atr, spot), swingHigh: prec(swingHigh, spot), swingLow: prec(swingLow, spot) },
      context: {
        regime: oiR?.regime ?? null,
        longShortRatio: lsRatio,
        takerBuyShare: buyShare,
        bookImbalance: book?.imbalance ?? null,
        volPremium: edge?.volatility?.premium ?? null,
        fundingApr,
        gammaFlip: opts?.flipLevel ?? null,
        maxPain: opts?.maxPain ?? null,
      },
      coverage: {
        // Not every source covers every coin, and a missing input silently
        // lowering confluence would be misleading
        positioning: edge?.openInterest?.regime != null,
        options: !!opts,
        book: !!book,
        note: edge?.openInterest?.regime == null
          ? `OKX does not publish open-interest history for ${coin}, so the strongest input is missing and confluence is capped well below what a major would score.`
          : !opts ? `${coin} has no listed options, so there are no GEX levels — stops and targets come from price structure alone.` : null,
      },
      validated: false,
      disclaimer: 'Rules engine, not a backtested edge. Free historical open-interest, funding and GEX series do not exist, so this could not be walk-forward tested the way the FX strategies in this app were. Track it forward before sizing up.',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message, coin }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=30, stale-while-revalidate=30',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
