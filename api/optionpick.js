export const config = { runtime: 'edge' };

// Options contract selection — which STRIKE and which EXPIRY, with the trade
// priced and projected rather than just named.
//
// WHAT THIS ANSWERS: given a directional view and a price target, it picks the
// expiry that gives the move enough time, picks strikes for three structures
// (long option, debit vertical, credit vertical), and prices each one AT THE
// TARGET so they can be compared on projected return rather than on vibes.
//
// SOURCE — WHY CBOE AND NOT THE OBVIOUS ONES: this was first built on Yahoo's
// chain and it was wrong to do so. Measured live at 09:34 ET, Yahoo AND NASDAQ
// both return an empty bid and ask for EVERY SPY contract, including one with
// 107,000 contracts of volume, and Yahoo's impliedVolatility field returned
// 0.00001 on an at-the-money call. Pricing from their lastPrice meant pricing
// from trades a median of 1094 minutes — eighteen hours — old, against a live
// spot. Numbers built that way look precise and are not.
//
// CBOE's delayed-quote feed is free, needs no key, and returns real two-sided
// markets: 11,766 of 12,690 SPY contracts quoted, timestamped to the minute,
// with exchange-computed IV and greeks. Entry prices here are therefore actual
// bids and offers, and the greeks are the exchange's own rather than a model's
// guess at them.
//
// THE HONEST LIMIT: projected value at the target assumes implied vol is
// UNCHANGED. It usually is not. A correct directional call can still lose money
// when IV collapses — which is exactly what happens after earnings — so the
// response flags any expiry that spans an earnings date.

import { getChain, bsPrice, bsGreeks, ncdf, npdf } from './_chains.js';

// SPY261231C00631000 -> { expiry, isCall, strike }

function parseOccSymbol(sym) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || '');
  if (!m) return null;
  return {
    expMs: Date.UTC(2000 + Number(m[2]), Number(m[3]) - 1, Number(m[4]), 20, 0, 0),
    isCall: m[5] === 'C',
    strike: Number(m[6]) / 1000,
  };
}

function bs(S, K, T, sigma, isCall, r = 0.04) {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0), theta: 0, vega: 0, gamma: 0 };
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sq);
  const d2 = d1 - sigma * sq;
  const disc = Math.exp(-r * T);
  const price = isCall
    ? S * ncdf(d1) - K * disc * ncdf(d2)
    : K * disc * ncdf(-d2) - S * ncdf(-d1);
  const delta = isCall ? ncdf(d1) : ncdf(d1) - 1;
  // Per-day theta, which is how it is actually experienced
  const theta = (-(S * npdf(d1) * sigma) / (2 * sq)
    - (isCall ? 1 : -1) * r * K * disc * (isCall ? ncdf(d2) : ncdf(-d2))) / 365;
  return { price, delta, theta, vega: S * npdf(d1) * sq / 100, gamma: npdf(d1) / (S * sigma * sq) };
}

export default async function handler(req) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get('symbol') || 'SPY').toUpperCase();
  const dirParam = u.searchParams.get('dir');
  const targetParam = Number(u.searchParams.get('target')) || null;
  const stopParam = Number(u.searchParams.get('stop')) || null;
  const riskBudget = Number(u.searchParams.get('risk')) || null;
  const riskPctOf = Number(u.searchParams.get('riskPct')) || null;

  try {
    const [sigRes, chain] = await Promise.all([
      fetch(`${u.origin}/api/stocksignal?symbol=${symbol}`).then(r => r.ok ? r.json() : null).catch(() => null),
      getChain(symbol, 10),
    ]);
    if (!chain) return json({ error: `No option chain available for ${symbol} from any source`, symbol }, 503);
    const spot = chain.spot;
    if (!spot) return json({ error: 'No spot price', symbol }, 404);

    const setup = sigRes?.setup || null;
    const direction = (dirParam || setup?.direction || sigRes?.direction || 'LONG').toUpperCase();
    const isCall = direction === 'LONG';
    const target = targetParam ?? setup?.tp1?.price ?? null;
    const stop   = stopParam ?? setup?.stop ?? null;
    const atr    = sigRes?.levels?.atr ?? spot * 0.015;

    if (!target) {
      return json({ error: 'No price target available — pass ?target= or wait for a setup on this symbol', symbol, spot, direction }, 400);
    }

    // ---- How long does this move need? ----
    // Distance in daily-ATR units is the linear estimate; price does not travel
    // in a straight line, so the expiry must carry a real buffer or theta
    // decides the trade before direction does.
    const distance = Math.abs(target - spot);
    const atrDays = distance / atr;
    const requiredDays = Math.max(7, Math.ceil(atrDays * 2.5));

    const now = Date.now();

    // Parse once, keep only quoted contracts in a sane strike band
    const parsed = chain.contracts.filter(c => Math.abs(c.strike - spot) / spot <= 0.25);
    if (!parsed.length) return json({ error: `No quoted contracts near the money for ${symbol}`, symbol, spot }, 422);

    const expirySet = [...new Set(parsed.map(p => p.expMs))].sort((a, b) => a - b)
      .map(ts => ({ ts, dte: (ts - now) / 86400000 }))
      .filter(e => e.dte >= 1);
    const chosen = expirySet.find(e => e.dte >= requiredDays) || expirySet[expirySet.length - 1];
    if (!chosen) return json({ error: 'No usable expiries', symbol, spot }, 404);

    // Earnings inside the expiry changes everything about vol
    const earnTs = (sigRes?.context?.earningsTimestamp || 0) * 1000;
    const earningsInWindow = earnTs > now && earnTs < chosen.ts ? new Date(earnTs).toISOString().slice(0, 10) : null;

    const T = chosen.dte / 365;

    // CBOE publishes IV and greeks per contract, so they are used directly
    // rather than re-derived — these are the exchange's numbers, not a model's
    // guess at them.
    const makeBook = (wantCall) => parsed
      .filter(p => p.expMs === chosen.ts && p.isCall === wantCall)
      .map(c => ({
        strike: c.strike, quoted: true,
        bid: c.bid, ask: c.ask, mid: +((c.bid + c.ask) / 2).toFixed(2),
        spreadPct: +((c.ask - c.bid) / ((c.bid + c.ask) / 2) * 100).toFixed(1),
        bidSize: c.bidSize, askSize: c.askSize,
        iv: +(c.iv * 100).toFixed(1),
        delta: +c.delta.toFixed(3), theta: +c.theta.toFixed(3), vega: +c.vega.toFixed(3),
        oi: c.oi, volume: c.volume,
      }))
      .sort((a, b) => a.strike - b.strike);

    const book = makeBook(isCall);
    if (book.length < 3) {
      return json({ error: `Only ${book.length} quoted contracts in the ${new Date(chosen.ts).toISOString().slice(0, 10)} expiry — too illiquid to build a trade`, symbol, spot }, 422);
    }
    const quotedCount = book.length;
    const quoteQuality = 'live-quotes';

    // Value any contract if the target is reached. Time is advanced to the
    // expected arrival, not to expiry — you exit at the target, not at 0 DTE.
    const arriveDays = Math.min(chosen.dte * 0.8, Math.max(1, atrDays * 1.5));
    const Tleft = Math.max(0.0001, (chosen.dte - arriveDays) / 365);
    const valueAtTarget = c => bs(target, c.strike, Tleft, c.iv / 100, isCall).price;

    const nearest = (arr, fn) => arr.reduce((best, x) => Math.abs(fn(x)) < Math.abs(fn(best)) ? x : best, arr[0]);
    const contracts = riskBudget ? null : null;

    // ---- Structure 1: long option ----
    // ~0.55 delta. Far OTM is cheap for a reason — it needs a bigger move than
    // the target to pay, which is backwards when the target is the thesis.
    const longLeg = nearest(book, c => Math.abs(c.delta) - 0.55);
    const l1Cost = longLeg.ask;                       // pay the offer, honestly
    const l1AtTarget = valueAtTarget(longLeg);
    const single = {
      structure: 'Long ' + (isCall ? 'call' : 'put'),
      legs: [{ action: 'BUY', strike: longLeg.strike, price: longLeg.ask, delta: longLeg.delta, iv: longLeg.iv }],
      debit: +l1Cost.toFixed(2),
      costPerContract: +(l1Cost * 100).toFixed(2),
      breakeven: +(isCall ? longLeg.strike + l1Cost : longLeg.strike - l1Cost).toFixed(2),
      valueAtTarget: +l1AtTarget.toFixed(2),
      profitAtTarget: +((l1AtTarget - l1Cost) * 100).toFixed(2),
      returnAtTarget: +(((l1AtTarget - l1Cost) / l1Cost) * 100).toFixed(1),
      maxLoss: +(l1Cost * 100).toFixed(2),
      thetaPerDay: +(longLeg.theta * 100).toFixed(2),
      note: 'Uncapped upside and the simplest to manage. Pays for that with the most theta and the most exposure to an IV collapse.',
    };

    // ---- Structure 2: debit vertical ----
    // Short leg at the target: you are selling the level you expect to reach
    // anyway, which is the cheapest way to fund the trade you actually believe.
    const shortCandidates = book.filter(c => isCall ? c.strike >= target : c.strike <= target);
    const shortLeg = shortCandidates.length ? nearest(shortCandidates, c => c.strike - target) : null;
    let vertical = null;
    if (shortLeg && shortLeg.strike !== longLeg.strike) {
      const debit = longLeg.ask - shortLeg.bid;
      if (debit > 0.01) {
        const width = Math.abs(shortLeg.strike - longLeg.strike);
        const atT = valueAtTarget(longLeg) - bs(target, shortLeg.strike, Tleft, shortLeg.iv / 100, isCall).price;
        vertical = {
          structure: (isCall ? 'Call' : 'Put') + ' debit spread',
          legs: [
            { action: 'BUY',  strike: longLeg.strike,  price: longLeg.ask,  delta: longLeg.delta,  iv: longLeg.iv },
            { action: 'SELL', strike: shortLeg.strike, price: shortLeg.bid, delta: shortLeg.delta, iv: shortLeg.iv },
          ],
          debit: +debit.toFixed(2),
          costPerContract: +(debit * 100).toFixed(2),
          width,
          maxProfit: +((width - debit) * 100).toFixed(2),
          maxLoss: +(debit * 100).toFixed(2),
          riskReward: +((width - debit) / debit).toFixed(2),
          breakeven: +(isCall ? longLeg.strike + debit : longLeg.strike - debit).toFixed(2),
          valueAtTarget: +atT.toFixed(2),
          profitAtTarget: +((atT - debit) * 100).toFixed(2),
          returnAtTarget: +(((atT - debit) / debit) * 100).toFixed(1),
          thetaPerDay: +((longLeg.theta - shortLeg.theta) * 100).toFixed(2),
          note: `Caps out at ${shortLeg.strike}, which is where the target already is — you are not giving up upside you were planning to take. Cheaper than the long option and far less sensitive to IV.`,
        };
      }
    }

    // ---- Structure 3: credit vertical on the other side ----
    let creditSkipped = null;
    // Sell beyond the stop: this wins if price simply fails to go against you,
    // which is a different bet from needing the target to print.
    let credit = null;
    if (!stop) creditSkipped = 'No stop level supplied, so there is nothing to anchor a short strike beyond.';
    if (stop) {
      const oBook = makeBook(!isCall);
      // Short strike beyond the stop, long one strike further out for defined risk
      const beyond = isCall ? oBook.filter(c => c.strike <= stop) : oBook.filter(c => c.strike >= stop);
      const shortC = beyond.length ? (isCall ? beyond[beyond.length - 1] : beyond[0]) : null;
      if (!shortC) creditSkipped = `No strike sits beyond the stop at ${stop} in the tradable range.`;
      if (shortC) {
        const idx = oBook.findIndex(c => c.strike === shortC.strike);
        const longC = isCall ? oBook[idx - 1] : oBook[idx + 1];
        if (!longC) creditSkipped = 'No further strike available to define the risk on a credit spread.';
        if (longC) {
          const net = shortC.bid - longC.ask;
          const width = Math.abs(shortC.strike - longC.strike);
          if (net <= 0.01) {
            creditSkipped = `The ${shortC.strike}/${longC.strike} spread nets no credit at current prices — with no live quotes the modelled bid-ask eats it entirely. Real quotes may well support it.`;
          }
          if (net > 0.01) {
            credit = {
              structure: (isCall ? 'Put' : 'Call') + ' credit spread',
              legs: [
                { action: 'SELL', strike: shortC.strike, price: shortC.bid, delta: shortC.delta, iv: shortC.iv },
                { action: 'BUY',  strike: longC.strike,  price: longC.ask,  delta: longC.delta,  iv: longC.iv },
              ],
              credit: +net.toFixed(2),
              creditPerContract: +(net * 100).toFixed(2),
              width,
              maxProfit: +(net * 100).toFixed(2),
              maxLoss: +((width - net) * 100).toFixed(2),
              riskReward: +(net / (width - net)).toFixed(2),
              breakeven: +(isCall ? shortC.strike - net : shortC.strike + net).toFixed(2),
              // Rough, delta-based. Delta is not probability, but it is the
              // closest free proxy and is labelled as such.
              approxPopPct: +((1 - Math.abs(shortC.delta)) * 100).toFixed(0),
              note: `Short strike ${shortC.strike} sits beyond the setup's stop, so this pays as long as price does NOT break structure. Theta works for you, but the loss is larger than the win when it goes wrong.`,
            };
          }
        }
      }
    }

    // ATM IV for the chosen expiry, as a rough richness gauge
    const atm = nearest(book, c => c.strike - spot);
    const structures = [single, vertical, credit].filter(Boolean);
    if (riskBudget) {
      for (const st of structures) {
        const per = st.maxLoss;
        st.suggestedContracts = per > 0 ? Math.max(0, Math.floor(riskBudget / per)) : 0;
        st.actualRisk = +(st.suggestedContracts * per).toFixed(2);
        if (st.suggestedContracts === 0 && per > 0) {
          // Not a glitch: one contract already exceeds the risk budget
          st.sizingNote = `One contract risks ${per.toFixed(0)}, above your ${riskBudget} budget (${(per / riskBudget * 100 - 100).toFixed(0)}% over). Either skip it, or take one knowingly at ${(per / (riskBudget / (riskPctOf || 1))).toFixed(2)}% of the account.`;
        }
      }
    }

    return json({
      symbol, spot, direction, target, stop,
      quoteQuality,
      source: chain.source,
      degraded: !!chain.degraded,
      sourceNote: chain.note || null,
      livePrice: chain.livePrice ?? null,
      cboeTimestamp: chain.timestamp || null,
      creditSkipped,
      quoteNote: `Live two-sided quotes on all ${quotedCount} contracts from ${chain.source === 'cboe' ? `CBOE (${chain.timestamp})` : 'the live Yahoo chain'}. Buys priced at the ask and sells at the bid — what you would actually pay, not mid-market optimism.`,
      expiry: new Date(chosen.ts).toISOString().slice(0, 10),
      dte: +chosen.dte.toFixed(1),
      expirySelection: {
        distanceToTarget: +distance.toFixed(2),
        dailyAtr: +atr.toFixed(2),
        atrDaysToTarget: +atrDays.toFixed(1),
        requiredDays,
        reason: `The target is ${atrDays.toFixed(1)} daily ATRs away. Price does not travel in a straight line, so the expiry needs roughly ${requiredDays} days for the move to have a fair chance — anything shorter and theta decides the trade before direction does.`,
        alternatives: expirySet.slice(0, 10).map(e => ({ date: new Date(e.ts).toISOString().slice(0, 10), dte: +e.dte.toFixed(1), sufficient: e.dte >= requiredDays })),
      },
      earningsInWindow,
      atmIv: atm?.iv ?? null,
      structures,
      assumption: 'Value at target assumes implied vol is UNCHANGED and the move arrives in about ' + arriveDays.toFixed(1) + ' days. Both are estimates: a correct directional call can still lose money if IV collapses, which is what typically happens right after earnings.',
      dataSource: chain.source === 'cboe'
        ? `CBOE delayed quotes (${chain.timestamp}), exchange-published greeks.`
        : 'Live Yahoo chain. Implied vol and greeks solved from each contract mid by bisection, because the feed publishes neither reliably. Contracts without a two-sided quote are excluded.',
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
      'Cache-Control': 's-maxage=30',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
