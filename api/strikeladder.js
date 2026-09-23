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
// LIQUIDITY IS A GATE, NOT A FOOTNOTE. A strike you cannot fill is not a trade.
// Measured on SPY, expiries a week out vary enormously: 2026-09-30 carries a
// median 1469 open interest per strike while 2026-10-01, one day later, carries
// 20 with a median volume of 5. An earlier version of this endpoint recommended
// the thin one purely on probability. Every strike now reports the size resting
// at the offer, its open interest and its spread, and nothing can be
// recommended unless it is actually fillable.
//
// Magnets per expiry — max pain and the largest open-interest strikes — are
// shown because they are where dealer hedging concentrates into that date.

import { getChain, bsPrice, ncdf, npdf } from './_chains.js';

// Probability spot TOUCHES a level at any point before expiry — a different and
// usually much larger number than the probability it FINISHES beyond it. This is
// the relevant one if the plan is to sell into a move rather than hold to the
// bell, and for a near-the-money strike it runs close to double.
//
// First-passage probability for geometric Brownian motion via the reflection
// principle, in log space: X_t = ln(S_t/S) = vt + sigma*W_t with v = r - s^2/2,
// barrier b = ln(H/S).
function probTouch(S, H, T, sigma, above, r = 0.04) {
  if (T <= 0 || sigma <= 0 || H <= 0 || S <= 0) return null;
  const v = r - 0.5 * sigma * sigma;
  const b = Math.log(H / S);
  const sq = sigma * Math.sqrt(T);
  // Already through the barrier
  if (above && b <= 0) return 1;
  if (!above && b >= 0) return 1;
  const p = above
    ? ncdf((v * T - b) / sq) + Math.exp(2 * v * b / (sigma * sigma)) * ncdf((-b - v * T) / sq)
    : ncdf((b - v * T) / sq) + Math.exp(2 * v * b / (sigma * sigma)) * ncdf((b + v * T) / sq);
  return Math.min(1, Math.max(0, p));
}

// Risk-neutral probability spot finishes beyond a level by expiry
function probBeyond(S, level, T, sigma, above, r = 0.04) {
  if (T <= 0 || sigma <= 0 || level <= 0) return null;
  const d2 = (Math.log(S / level) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return above ? ncdf(d2) : ncdf(-d2);
}


export default async function handler(req) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get('symbol') || 'SPY').toUpperCase();
  const dir = (u.searchParams.get('dir') || 'LONG').toUpperCase();
  const isCall = dir === 'LONG';
  const maxExpiries = Math.min(Number(u.searchParams.get('expiries')) || 10, 20);
  const target = Number(u.searchParams.get('target')) || null;

  try {
    const chain = await getChain(symbol, 12);
    if (!chain) return json({ error: `No option chain available for ${symbol} from any source`, symbol }, 503);
    const spot = chain.spot;
    const raw = chain.contracts;
    if (!spot || !raw.length) return json({ error: `No quoted contracts for ${symbol}`, symbol }, 404);

    const now = Date.now();
    const byExp = new Map();
    for (const c of raw) {
      if (Math.abs(c.strike - spot) / spot > 0.30) continue;
      if (!byExp.has(c.expMs)) byExp.set(c.expMs, []);
      byExp.get(c.expMs).push(c);
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
      const targetTouchPct = target != null
        ? +(probTouch(spot, target, T, sigma, isCall) * 100).toFixed(1)
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
        const pTouchStrike = probTouch(spot, c.strike, T, sigma, isCall);
        const pTouchBe = probTouch(spot, breakeven, T, sigma, isCall);
        picks.push({
          strike: c.strike,
          delta: +c.delta.toFixed(3),
          bid: c.bid, ask: c.ask,
          cost: +(cost * 100).toFixed(0),
          iv: +(c.iv * 100).toFixed(1),
          thetaPerDay: +(c.theta * 100).toFixed(2),
          oi: c.oi, volume: c.volume,
          bidSize: c.bidSize, askSize: c.askSize,
          spreadPct: +((c.ask - c.bid) / c.mid * 100).toFixed(1),
          // Can you actually get filled here, and at what cost in slippage
          ...(() => {
            const spreadPct = (c.ask - c.bid) / c.mid * 100;
            // Yahoo publishes no size at the touch. Treating that 0 as "no
            // liquidity" would mark every contract unfillable on the fallback
            // path, so open interest and spread carry the judgement there.
            const sizeOk = c.sizeUnknown ? c.oi >= 1000 : c.askSize >= 25;
            const sizeMin = c.sizeUnknown ? c.oi >= 250 : c.askSize >= 10;
            const deep = sizeOk && c.oi >= 250 && spreadPct <= 3;
            const ok   = sizeMin && c.oi >= 50  && spreadPct <= 8;
            return {
              fillable: deep || ok,
              liquidity: deep ? 'deep' : ok ? 'ok' : 'thin',
              liquidityNote: (c.sizeUnknown
                ? `${c.oi} open interest, ${c.volume} traded, ${spreadPct.toFixed(1)}% spread (size at the touch not published by this source)`
                : `${c.askSize} at the offer, ${c.oi} open interest, ${spreadPct.toFixed(1)}% spread`)
                + (deep ? ' — fills at the quote' : ok ? ' — workable, use a limit' : ' — you will pay up or not get filled'),
            };
          })(),
          breakeven: +breakeven.toFixed(2),
          breakevenMovePct: +((breakeven - spot) / spot * 100).toFixed(2),
          // How far the breakeven sits in units of this expiry's expected move
          breakevenInExpectedMoves: beInSd != null ? +beInSd.toFixed(2) : null,
          withinExpectedMove: beInSd != null ? beInSd <= 1 : null,
          probProfitPct: pProfit != null ? +(pProfit * 100).toFixed(1) : null,
          probItmPct: pItm != null ? +(pItm * 100).toFixed(1) : null,
          // Reaching the level at any point, vs still being beyond it at the bell
          probTouchStrikePct: pTouchStrike != null ? +(pTouchStrike * 100).toFixed(1) : null,
          probTouchBreakevenPct: pTouchBe != null ? +(pTouchBe * 100).toFixed(1) : null,
        });
      }

      // The pick must clear BOTH tests: a breakeven the market's own expected
      // move covers, AND enough resting size to actually trade. Probability
      // alone once recommended a strike with 20 open interest.
      // ---- If it goes above: what each level is worth, and the odds of getting
      // there. Value assumes the level is reached with HALF the remaining time
      // left — touch it in the first hour and the contract is worth more than
      // this, touch it near the bell and it is worth close to intrinsic.
      const Thalf = T / 2;
      const steps = [0.25, 0.5, 0.75, 1.0, 1.5];
      const levels = steps.map(k => {
        const level = isCall ? spot + k * expectedMove : spot - k * expectedMove;
        return {
          level: +level.toFixed(2),
          movePct: +((level - spot) / spot * 100).toFixed(2),
          expectedMoves: k,
          probTouchPct: +(probTouch(spot, level, T, sigma, isCall) * 100).toFixed(1),
          probFinishBeyondPct: +(probBeyond(spot, level, T, sigma, isCall) * 100).toFixed(1),
          // What each candidate strike is worth if price gets there
          strikeValues: picks.map(pk => {
            const val = bsPrice(level, pk.strike, Thalf, pk.iv / 100, isCall);
            const cost = pk.cost / 100;
            return {
              strike: pk.strike,
              value: +(val * 100).toFixed(0),
              profit: +((val - cost) * 100).toFixed(0),
              returnPct: cost > 0 ? +(((val - cost) / cost) * 100).toFixed(0) : null,
            };
          }),
        };
      });

      const affordable = picks.filter(p => p.withinExpectedMove && p.fillable);
      const best = affordable.length
        ? affordable.reduce((b, x) => x.probProfitPct > b.probProfitPct ? x : b)
        : null;
      const blockedByLiquidity = !best && picks.some(p => p.withinExpectedMove);

      const med = arr => { const q = arr.slice().sort((a, b) => a - b); return q.length ? q[Math.floor(q.length / 2)] : 0; };
      // Judge the DAY on strikes you would actually trade. Measuring across the
      // full ±30% band drags the median down with dead far-OTM strikes and
      // mislabelled 0DTE as thin when near the money it carries 442 open
      // interest.
      const tradeable = side.filter(c => Math.abs(c.strike - spot) / spot <= 0.05);
      const liqSample = tradeable.length >= 5 ? tradeable : side;
      const sideSpreads = liqSample.map(c => (c.ask - c.bid) / c.mid * 100);
      const medSpread = +med(sideSpreads).toFixed(1);
      const medOi = med(liqSample.map(c => c.oi));
      const sized = liqSample.filter(c => c.sizeUnknown ? c.oi >= 250 : c.askSize >= 10).length;
      const dayLiquidity = (medOi >= 250 && medSpread <= 3) ? 'deep'
        : (medOi >= 50 && medSpread <= 8) ? 'ok' : 'thin';

      rows.push({
        expiry: new Date(e.ts).toISOString().slice(0, 10),
        liquidity: {
          tier: dayLiquidity,
          medianSpreadPct: medSpread,
          medianOi: medOi,
          strikesWithSize: sized,
          strikesTotal: liqSample.length,
          measuredWithin: tradeable.length >= 5 ? '±5% of spot' : 'full quoted band',
          note: dayLiquidity === 'deep'
            ? `Real market all day — median ${medOi} open interest, ${medSpread}% spreads.`
            : dayLiquidity === 'ok'
              ? `Tradable with limit orders — median ${medOi} open interest, ${medSpread}% spreads.`
              : `Thin. Median ${medOi} open interest and ${medSpread}% spreads: orders sit, and crossing costs more than the edge.`,
        },
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
        targetProbPct, targetTouchPct, targetInExpectedMoves,
        strikes: picks,
        upside: {
          levels,
          note: `Levels are measured in this expiry's own expected move (±${expectedMove.toFixed(2)}). Contract values assume the level is reached with half the remaining time left — hit it early and it is worth more, hit it near the bell and it is worth close to intrinsic.`,
        },
        recommended: best ? best.strike : null,
        recommendation: best
          ? `${best.strike} — breakeven ${best.breakeven} is ${best.breakevenInExpectedMoves} expected moves away, inside what the market prices for this date. ${best.probProfitPct}% chance it finishes profitable, ${best.thetaPerDay} per day of decay. ${best.liquidityNote}.`
          : blockedByLiquidity
            ? `Strikes on this date price sensibly but there is no size behind them — median ${medOi} open interest and ${medSpread}% spreads. Skip the date rather than pay the spread.`
            : `No strike on this date has a breakeven inside the expected move. Every one needs a bigger move than the market is pricing — on this expiry you are buying the improbable, which is how option buyers bleed.`,
      });
    }

    // The expiry question answered directly: the soonest date by which the
    // market gives the target a realistic chance. 35% is a deliberate choice —
    // below roughly a third, a directional option buyer needs an unusually
    // large payoff to compensate, and most do not get one.
    // Must be both realistic AND fillable — an untradable date is not an answer
    const hit = target != null
      ? rows.find(r => r.targetProbPct != null && r.targetProbPct >= 35 && r.liquidity.tier !== 'thin')
      : null;
    const earliestReasonableExpiry = hit ? hit.expiry : null;
    const expiryAdvice = target == null ? null
      : hit
        ? `${target} is ${hit.targetInExpectedMoves} expected moves away by ${hit.expiry}, which the market prices at ${hit.targetProbPct}% — and that date has real markets (${hit.liquidity.note.toLowerCase()}). Earlier expiries need a bigger move than is priced, which is where premium goes to die.`
        : `No expiry in this window gives ${target} even a 35% chance. Either the target is too far for options on this timeframe, or you need to go further out in time than the ${rows.length} dates shown.`;

    return json({
      symbol, spot, direction: dir, target,
      source: chain.source,
      degraded: !!chain.degraded,
      sourceNote: chain.note || null,
      livePrice: chain.livePrice ?? null,
      cboeTimestamp: chain.timestamp || null,
      earliestReasonableExpiry,
      expiryAdvice,
      expiryCount: rows.length,
      ladder: rows,
      probabilityGuide: 'Two different probabilities are reported per strike. probTouchStrikePct is the chance price REACHES that strike at any point before expiry — the number that matters if you intend to sell into a move. probItmPct is the chance it is still beyond the strike at the bell, and probProfitPct the chance it is beyond your BREAKEVEN then. Touch is always the largest and, near the money, runs close to double the finish probability. Selling a touch and holding to expiry are different trades with materially different odds.',
      howToRead: 'For each date: expected move is that expiry\'s own implied 1-standard-deviation range, so roughly a 2-in-3 chance price lands inside it. A strike is only listed as recommended when its BREAKEVEN — not its strike — sits inside that range. Probability of profit is risk-neutral N(d2) from the same implied vol: the market\'s own odds, carrying no view of its own.',
      caveat: 'These are the market\'s implied odds, not a forecast, and they already include the premium you pay. No strike is reliably profitable on its own — profitability comes from taking these only when your directional read disagrees with the market\'s pricing, and sizing so the losers do not compound.',
      dataSource: chain.source === 'cboe' ? `CBOE delayed quotes, ${chain.timestamp}` : 'Yahoo live chain, implied vol and greeks solved from each contract mid',
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
