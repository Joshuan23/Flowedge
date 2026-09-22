export const config = { runtime: 'edge' };

// Strike ladder — for EVERY expiry, which strike is actually worth trading.
//
// THE QUESTION THIS ANSWERS HONESTLY: nobody can hand you a strike that is
// guaranteed profitable. What the option market DOES tell you, per expiry, is
// how far it expects price to travel by that date — the expected move, implied
// by that expiry's own at-the-money volatility. From that, one thing is
// decidable rather than guessable:
//
//   A long option only makes money above its BREAKEVEN, not above its strike.
//   If the breakeven sits outside the expected move, you are paying for a move
//   the market itself prices as unlikely. Do that repeatedly and the math does
//   not work no matter how good the direction calls are.
//
// So every strike here carries the probability it finishes profitable, computed
// from that expiry's own implied vol, and strikes whose breakeven falls beyond
// the expected move are labelled as such instead of being listed as equals.
//
// PROBABILITIES ARE RISK-NEUTRAL, NOT FORECASTS. N(d2) is what the option
// market's own pricing implies, which is the fairest available benchmark — but
// it embeds no view. A 35% probability of profit is not an edge or a warning on
// its own; it is the price of admission the market is charging.
//
// Magnets per expiry — max pain and the largest open-interest strikes — are
// shown because they are where dealer hedging concentrates into that date.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const CBOE = 'https://cdn.cboe.com/api/global/delayed_quotes/options/';

const npdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = npdf(x);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

// Risk-neutral probability spot finishes beyond a level by expiry
function probBeyond(S, level, T, sigma, above, r = 0.04) {
  if (T <= 0 || sigma <= 0 || level <= 0) return null;
  const d2 = (Math.log(S / level) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return above ? ncdf(d2) : ncdf(-d2);
}

function parseOcc(sym) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || '');
  if (!m) return null;
  return {
    expMs: Date.UTC(2000 + Number(m[2]), Number(m[3]) - 1, Number(m[4]), 20, 0, 0),
    isCall: m[5] === 'C',
    strike: Number(m[6]) / 1000,
  };
}

export default async function handler(req) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get('symbol') || 'SPY').toUpperCase();
  const dir = (u.searchParams.get('dir') || 'LONG').toUpperCase();
  const isCall = dir === 'LONG';
  const maxExpiries = Math.min(Number(u.searchParams.get('expiries')) || 10, 20);
  const target = Number(u.searchParams.get('target')) || null;

  try {
    const res = await fetch(`${CBOE}${symbol}.json`, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!res.ok) return json({ error: `CBOE HTTP ${res.status} — no chain for ${symbol}`, symbol }, res.status);
    const data = await res.json();
    const spot = Number(data?.data?.current_price) || null;
    const raw = data?.data?.options || [];
    if (!spot || !raw.length) return json({ error: `No chain data for ${symbol}`, symbol }, 404);

    const now = Date.now();
    const byExp = new Map();
    for (const o of raw) {
      const p = parseOcc(o.option);
      if (!p) continue;
      const bid = Number(o.bid) || 0, ask = Number(o.ask) || 0;
      if (bid <= 0 || ask <= 0) continue;                    // real markets only
      if (Math.abs(p.strike - spot) / spot > 0.30) continue;
      if (!byExp.has(p.expMs)) byExp.set(p.expMs, []);
      byExp.get(p.expMs).push({
        ...p, bid, ask, mid: (bid + ask) / 2,
        iv: Number(o.iv) || 0, delta: Number(o.delta) || 0, theta: Number(o.theta) || 0,
        oi: Number(o.open_interest) || 0, volume: Number(o.volume) || 0,
      });
    }

    const expiries = [...byExp.entries()]
      .map(([ts, contracts]) => ({ ts, dte: (ts - now) / 86400000, contracts }))
      .filter(e => e.dte > 0.02)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, maxExpiries);

    if (!expiries.length) return json({ error: 'No quoted expiries', symbol, spot }, 404);

    const rows = [];
    for (const e of expiries) {
      const T = e.dte / 365;
      const side = e.contracts.filter(c => c.isCall === isCall).sort((a, b) => a.strike - b.strike);
      if (side.length < 3) continue;

      // At-the-money IV defines this expiry's expected move
      const atm = side.reduce((b, x) => Math.abs(x.strike - spot) < Math.abs(b.strike - spot) ? x : b);
      const sigma = atm.iv;
      if (!(sigma > 0)) continue;
      const expectedMove = spot * sigma * Math.sqrt(T);

      // If a target is supplied, the single most useful number per date is the
      // market's own odds of getting there by then. That is what decides WHICH
      // EXPIRY to buy, far more than which strike.
      const targetProbPct = target != null
        ? +(probBeyond(spot, target, T, sigma, isCall) * 100).toFixed(1)
        : null;
      const targetInExpectedMoves = target != null && expectedMove > 0
        ? +(Math.abs(target - spot) / expectedMove).toFixed(2)
        : null;

      // Magnets for THIS date: where open interest concentrates
      const calls = e.contracts.filter(c => c.isCall);
      const puts  = e.contracts.filter(c => !c.isCall);
      const callWall = calls.length ? calls.reduce((b, x) => x.oi > b.oi ? x : b).strike : null;
      const putWall  = puts.length  ? puts.reduce((b, x) => x.oi > b.oi ? x : b).strike  : null;

      // Max pain: the strike where option holders collectively receive least
      let maxPain = null, minPay = Infinity;
      const strikes = [...new Set(e.contracts.map(c => c.strike))];
      for (const K of strikes) {
        let pay = 0;
        for (const c of e.contracts) {
          pay += c.isCall ? Math.max(0, K - c.strike) * c.oi : Math.max(0, c.strike - K) * c.oi;
        }
        if (pay < minPay) { minPay = pay; maxPain = K; }
      }

      // Candidate strikes across the useful delta range. Deeper than 0.75 is
      // mostly stock with extra spread; thinner than 0.20 needs a move the
      // market is not pricing.
      const wanted = [0.70, 0.55, 0.40, 0.30, 0.20];
      const picks = [];
      const seen = new Set();
      // Named wantDelta, not target: `target` is the PRICE target in this scope
      // and shadowing it here worked only by accident.
      for (const wantDelta of wanted) {
        const c = side.reduce((b, x) => Math.abs(Math.abs(x.delta) - wantDelta) < Math.abs(Math.abs(b.delta) - wantDelta) ? x : b);
        if (seen.has(c.strike)) continue;
        seen.add(c.strike);
        const cost = c.ask;
        const breakeven = isCall ? c.strike + cost : c.strike - cost;
        const beDistance = Math.abs(breakeven - spot);
        const beInSd = expectedMove > 0 ? beDistance / expectedMove : null;
        const pProfit = probBeyond(spot, breakeven, T, sigma, isCall);
        const pItm = probBeyond(spot, c.strike, T, sigma, isCall);
        picks.push({
          strike: c.strike,
          delta: +c.delta.toFixed(3),
          bid: c.bid, ask: c.ask,
          cost: +(cost * 100).toFixed(0),
          iv: +(c.iv * 100).toFixed(1),
          thetaPerDay: +(c.theta * 100).toFixed(2),
          oi: c.oi, volume: c.volume,
          spreadPct: +((c.ask - c.bid) / c.mid * 100).toFixed(1),
          breakeven: +breakeven.toFixed(2),
          breakevenMovePct: +((breakeven - spot) / spot * 100).toFixed(2),
          // How far the breakeven sits in units of this expiry's expected move
          breakevenInExpectedMoves: beInSd != null ? +beInSd.toFixed(2) : null,
          withinExpectedMove: beInSd != null ? beInSd <= 1 : null,
          probProfitPct: pProfit != null ? +(pProfit * 100).toFixed(1) : null,
          probItmPct: pItm != null ? +(pItm * 100).toFixed(1) : null,
        });
      }

      // The pick: cheapest admission whose breakeven the market's own expected
      // move actually covers. Ties break toward the higher probability.
      const affordable = picks.filter(p => p.withinExpectedMove);
      const best = affordable.length
        ? affordable.reduce((b, x) => x.probProfitPct > b.probProfitPct ? x : b)
        : null;

      rows.push({
        expiry: new Date(e.ts).toISOString().slice(0, 10),
        dte: +e.dte.toFixed(2),
        atmIv: +(sigma * 100).toFixed(1),
        expectedMove: +expectedMove.toFixed(2),
        expectedMovePct: +(expectedMove / spot * 100).toFixed(2),
        impliedHigh: +(spot + expectedMove).toFixed(2),
        impliedLow: +(spot - expectedMove).toFixed(2),
        magnets: {
          maxPain, callWall, putWall,
          // Distance matters: a wall 10% away is open interest, not a magnet
          callWallPct: callWall ? +((callWall - spot) / spot * 100).toFixed(2) : null,
          putWallPct: putWall ? +((putWall - spot) / spot * 100).toFixed(2) : null,
          maxPainPct: maxPain ? +((maxPain - spot) / spot * 100).toFixed(2) : null,
        },
        targetProbPct, targetInExpectedMoves,
        strikes: picks,
        recommended: best ? best.strike : null,
        recommendation: best
          ? `${best.strike} — breakeven ${best.breakeven} is ${best.breakevenInExpectedMoves} expected moves away, inside what the market prices for this date. ${best.probProfitPct}% chance it finishes profitable, ${best.thetaPerDay} per day of decay.`
          : `No strike on this date has a breakeven inside the expected move. Every one needs a bigger move than the market is pricing — on this expiry you are buying the improbable, which is how option buyers bleed.`,
      });
    }

    // The expiry question answered directly: the soonest date by which the
    // market gives the target a realistic chance. 35% is a deliberate choice —
    // below roughly a third, a directional option buyer needs an unusually
    // large payoff to compensate, and most do not get one.
    const hit = target != null ? rows.find(r => r.targetProbPct != null && r.targetProbPct >= 35) : null;
    const earliestReasonableExpiry = hit ? hit.expiry : null;
    const expiryAdvice = target == null ? null
      : hit
        ? `${target} is ${hit.targetInExpectedMoves} expected moves away by ${hit.expiry}, which the market prices at ${hit.targetProbPct}%. Earlier expiries need a bigger move than is priced — that is where premium goes to die.`
        : `No expiry in this window gives ${target} even a 35% chance. Either the target is too far for options on this timeframe, or you need to go further out in time than the ${rows.length} dates shown.`;

    return json({
      symbol, spot, direction: dir, target,
      cboeTimestamp: data?.timestamp || null,
      earliestReasonableExpiry,
      expiryAdvice,
      expiryCount: rows.length,
      ladder: rows,
      howToRead: 'For each date: expected move is that expiry\'s own implied 1-standard-deviation range, so roughly a 2-in-3 chance price lands inside it. A strike is only listed as recommended when its BREAKEVEN — not its strike — sits inside that range. Probability of profit is risk-neutral N(d2) from the same implied vol: the market\'s own odds, carrying no view of its own.',
      caveat: 'These are the market\'s implied odds, not a forecast, and they already include the premium you pay. No strike is reliably profitable on its own — profitability comes from taking these only when your directional read disagrees with the market\'s pricing, and sizing so the losers do not compound.',
      source: `CBOE delayed quotes, live two-sided markets, ${data?.timestamp || 'n/a'}`,
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
