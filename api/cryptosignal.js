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

const OKX = 'https://www.okx.com/api/v5';

const jget = async (u) => {
  try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; }
};

export default async function handler(req) {
  const url    = new URL(req.url);
  const origin = url.origin;
  const coin   = (url.searchParams.get('coin') || 'BTC').toUpperCase();
  const hasOptions = coin === 'BTC' || coin === 'ETH';

  try {
    const [edge, opts, book, flow, candleRes] = await Promise.all([
      jget(`${origin}/api/cryptoedge?coin=${coin}`),
      hasOptions ? jget(`${origin}/api/cryptooptions?currency=${coin}`) : Promise.resolve(null),
      jget(`${origin}/api/orderbook?coin=${coin}`),
      jget(`${origin}/api/cryptoflow?coin=${coin}`),
      jget(`${OKX}/market/candles?instId=${coin}-USDT-SWAP&bar=1H&limit=100`),
    ]);

    const candles = ((candleRes?.data) || []).map(r => ({
      t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4],
    })).filter(r => r.c > 0).reverse();
    if (candles.length < 30) return json({ error: `No price history for ${coin}`, coin }, 404);

    const spot = book?.mid || edge?.openInterest?.priceNow || candles[candles.length - 1].c;

    // ---- ATR(14) on 1h, the unit of noise ----
    let trSum = 0, n = 0;
    for (let i = Math.max(1, candles.length - 14); i < candles.length; i++) {
      const p = candles[i - 1], x = candles[i];
      trSum += Math.max(x.h - x.l, Math.abs(x.h - p.c), Math.abs(x.l - p.c));
      n++;
    }
    const atr = n ? trSum / n : spot * 0.005;

    const recent = candles.slice(-48);
    const swingHigh = Math.max(...recent.map(r => r.h));
    const swingLow  = Math.min(...recent.map(r => r.l));

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

    // Targets beyond ~10 ATR are a different timeframe's trade. This setup is
    // built on 1h ATR and 48h structure, so a level 7% away (max pain) or 24%
    // away (a far put wall) is not something to hold this plan toward.
    const MAX_TARGET_ATR = 10;
    const reachable = l => Math.abs(l.price - spot) <= MAX_TARGET_ATR * atr;

    above.sort((a, b) => a.price - b.price);
    below.sort((a, b) => b.price - a.price);

    // ---- Build the plan ----
    const MIN_RR = 1.5;              // the app's standing minimum
    const MIN_CONF = 45;             // below this, confluence is not there
    let setup = null, noTrade = null;

    if (confidence < MIN_CONF) {
      noTrade = `Confluence only ${confidence}%. The inputs disagree or are flat — no setup worth risking capital on.`;
    } else {
      const isLong = dir === 'LONG';
      const protect = isLong ? below : above;      // levels the stop must clear
      const targets = isLong ? above : below;

      // Stop: beyond the nearest real level, with an ATR buffer so ordinary
      // noise does not take it out. If no level is close enough to be relevant,
      // fall back to a pure volatility stop.
      // A stop must clear structure AND clear noise. Structure alone is not
      // enough: a level sitting 0.2 ATR from spot gives a stop that ordinary
      // chop removes. So take whichever is WIDER — structure plus a buffer, or
      // a 1.2 ATR volatility floor.
      const MIN_STOP_ATR = 1.2;
      const floor = isLong ? spot - MIN_STOP_ATR * atr : spot + MIN_STOP_ATR * atr;
      const nearProtect = protect.find(l => Math.abs(l.price - spot) < 4 * atr);
      let sl, slBasis;
      if (nearProtect) {
        const structural = isLong ? nearProtect.price - 0.5 * atr : nearProtect.price + 0.5 * atr;
        if (isLong ? structural < floor : structural > floor) {
          sl = structural;
          slBasis = `${nearProtect.label} ${nearProtect.price.toLocaleString()} + 0.5 ATR buffer`;
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

      if (riskPct > 4) {
        noTrade = `Stop would sit ${riskPct.toFixed(1)}% away — structure is too far from price to risk sensibly right now.`;
      } else if (risk <= 0) {
        noTrade = 'Could not derive a valid stop from current structure.';
      } else {
        // Targets must be REAL levels at least 1.5R away. If none qualifies,
        // that is a genuine no-trade rather than a reason to invent a number.
        const qualifying = targets.filter(l => Math.abs(l.price - spot) >= MIN_RR * risk && reachable(l));
        if (!qualifying.length) {
          const nearest = targets.filter(reachable)[0];
          noTrade = nearest
            ? `Nearest level (${nearest.label} ${nearest.price.toLocaleString()}) is only ${(Math.abs(nearest.price - spot) / risk).toFixed(2)}R away. No room for ${MIN_RR}:1 — skip it.`
            : 'No structural target in range to trade toward.';
        } else {
          const tp1 = qualifying[0];
          const tp2 = qualifying[1] || null;
          const rr1 = Math.abs(tp1.price - spot) / risk;
          const rr2 = tp2 ? Math.abs(tp2.price - spot) / risk : null;
          setup = {
            direction: dir,
            entry: +spot.toFixed(spot > 1000 ? 1 : 4),
            stop: +sl.toFixed(spot > 1000 ? 1 : 4),
            riskPerUnit: +risk.toFixed(spot > 1000 ? 1 : 4),
            riskPct: +riskPct.toFixed(2),
            stopBasis: slBasis,
            tp1: { price: +tp1.price.toFixed(spot > 1000 ? 1 : 4), rr: +rr1.toFixed(2), basis: tp1.label },
            tp2: tp2 ? { price: +tp2.price.toFixed(spot > 1000 ? 1 : 4), rr: +rr2.toFixed(2), basis: tp2.label } : null,
            atr: +atr.toFixed(spot > 1000 ? 1 : 4),
            // Matches the management used everywhere else in the app
            management: 'Bank half at TP1 and move the stop to breakeven. Run the rest to TP2 — worst case from there is a scratch, not a loss.',
          };
        }
      }
    }

    return json({
      coin, spot, confidence, direction: dir, rawScore: +rawScore.toFixed(2),
      factors, setup, noTrade,
      levels: { above: above.slice(0, 5), below: below.slice(0, 5), bookWalls, atr: +atr.toFixed(2), swingHigh, swingLow },
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
