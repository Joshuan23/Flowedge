export const config = { runtime: 'edge' };

// Options contract selection — which STRIKE and which EXPIRY, with the trade
// priced and projected rather than just named.
//
// WHAT THIS ANSWERS: given a directional view and a price target, it picks the
// expiry that gives the move enough time, picks strikes for three structures
// (long option, debit vertical, credit vertical), and prices each one AT THE
// TARGET so they can be compared on projected return rather than on vibes.
//
// TWO THINGS IT DOES NOT TRUST:
//   1. Yahoo's per-contract impliedVolatility field. Measured live it returned
//      0.00001 on an at-the-money SPY call — unusable. Implied vol here is
//      solved from the contract's own mid price by bisection, so every greek
//      derives from the price you would actually pay.
//   2. lastPrice as a fill. A stale last from hours ago is not a market. Mid of
//      bid/ask is used where a two-sided quote exists, and a contract without
//      one is excluded rather than priced off a ghost.
//
// THE HONEST LIMIT: projected value at the target assumes implied vol is
// UNCHANGED. It usually is not. A correct directional call can still lose money
// when IV collapses — which is exactly what happens after earnings — so the
// response flags any expiry that spans an earnings date.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// ---- Black-Scholes ---------------------------------------------------------
const npdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = npdf(x);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
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

// Solve implied vol from a market price. Bisection rather than Newton: slower,
// but it cannot diverge on the badly-behaved quotes that live in option chains.
function impliedVol(mkt, S, K, T, isCall) {
  if (!(mkt > 0) || T <= 0) return null;
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  if (mkt < intrinsic - 0.01) return null;          // below intrinsic: bad quote
  let lo = 0.01, hi = 5;
  if (bs(S, K, T, hi, isCall).price < mkt) return null;   // unreachable even at 500% vol
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bs(S, K, T, mid, isCall).price < mkt) lo = mid; else hi = mid;
  }
  const v = (lo + hi) / 2;
  return v > 0.015 && v < 4.9 ? v : null;
}

async function getCrumb() {
  const seed = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const cookie = (seed.headers.get('set-cookie') || '').split(',').map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
  const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, 'Cookie': cookie } });
  return { cookie, crumb: (await res.text()).trim() };
}

export default async function handler(req) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get('symbol') || 'SPY').toUpperCase();
  const dirParam = u.searchParams.get('dir');
  const targetParam = Number(u.searchParams.get('target')) || null;
  const stopParam = Number(u.searchParams.get('stop')) || null;
  const riskBudget = Number(u.searchParams.get('risk')) || null;

  try {
    const { cookie, crumb } = await getCrumb();
    if (!crumb) return json({ error: 'Could not obtain Yahoo crumb', symbol }, 502);
    const headers = { 'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json' };

    // Pull the app's own setup so strike selection is anchored to the same
    // target and stop the stock engine produced, rather than to a fresh guess
    const [sigRes, firstRes] = await Promise.all([
      fetch(`${u.origin}/api/stocksignal?symbol=${symbol}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://query1.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${encodeURIComponent(crumb)}`, { headers }),
    ]);
    if (!firstRes.ok) return json({ error: `Yahoo HTTP ${firstRes.status}`, symbol }, firstRes.status);

    const root = (await firstRes.json())?.optionChain?.result?.[0];
    if (!root) return json({ error: `No option chain for ${symbol}`, symbol }, 404);
    const spot = root.quote?.regularMarketPrice;
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
    const expiries = (root.expirationDates || [])
      .map(t => ({ ts: t * 1000, dte: (t * 1000 - now) / 86400000 }))
      .filter(e => e.dte >= 1);

    // Nearest expiry that clears the requirement; if none does, the furthest
    const chosen = expiries.find(e => e.dte >= requiredDays) || expiries[expiries.length - 1];
    if (!chosen) return json({ error: 'No usable expiries', symbol, spot }, 404);

    // Earnings inside the expiry changes everything about vol
    const earnTs = (root.quote?.earningsTimestamp || 0) * 1000;
    const earningsInWindow = earnTs > now && earnTs < chosen.ts ? new Date(earnTs).toISOString().slice(0, 10) : null;

    const chainRes = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${Math.round(chosen.ts / 1000)}&crumb=${encodeURIComponent(crumb)}`,
      { headers });
    const chainRoot = chainRes.ok ? (await chainRes.json())?.optionChain?.result?.[0] : null;
    const opt = chainRoot?.options?.[0];
    if (!opt) return json({ error: 'Could not load the chosen expiry chain', symbol, spot }, 502);

    const T = chosen.dte / 365;
    const side = isCall ? (opt.calls || []) : (opt.puts || []);

    // Build a clean book: two-sided quotes only, own IV solved from mid
    const book = [];
    for (const c of side) {
      const K = Number(c.strike);
      const bid = Number(c.bid) || 0, ask = Number(c.ask) || 0;
      if (!K || bid <= 0 || ask <= 0) continue;         // no ghost quotes
      if (Math.abs(K - spot) / spot > 0.25) continue;
      const mid = (bid + ask) / 2;
      const iv = impliedVol(mid, spot, K, T, isCall);
      if (!iv) continue;
      const g = bs(spot, K, T, iv, isCall);
      book.push({
        strike: K, bid, ask, mid: +mid.toFixed(2),
        spreadPct: +((ask - bid) / mid * 100).toFixed(1),
        iv: +(iv * 100).toFixed(1),
        delta: +g.delta.toFixed(3), theta: +g.theta.toFixed(3), vega: +g.vega.toFixed(3),
        oi: Number(c.openInterest) || 0, volume: Number(c.volume) || 0,
      });
    }
    if (book.length < 3) {
      return json({ error: 'Too few two-sided quotes to build a trade — the chain is illiquid or the market is closed', symbol, spot, expiry: new Date(chosen.ts).toISOString().slice(0, 10) }, 422);
    }
    book.sort((a, b) => a.strike - b.strike);

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
    // Sell beyond the stop: this wins if price simply fails to go against you,
    // which is a different bet from needing the target to print.
    let credit = null;
    if (stop) {
      const otherSide = isCall ? (opt.puts || []) : (opt.calls || []);
      const oBook = [];
      for (const c of otherSide) {
        const K = Number(c.strike);
        const bid = Number(c.bid) || 0, ask = Number(c.ask) || 0;
        if (!K || bid <= 0 || ask <= 0) continue;
        if (Math.abs(K - spot) / spot > 0.25) continue;
        const mid = (bid + ask) / 2;
        const iv = impliedVol(mid, spot, K, T, !isCall);
        if (!iv) continue;
        const g = bs(spot, K, T, iv, !isCall);
        oBook.push({ strike: K, bid, ask, mid, iv: +(iv * 100).toFixed(1), delta: +g.delta.toFixed(3) });
      }
      oBook.sort((a, b) => a.strike - b.strike);
      // Short strike beyond the stop, long one strike further out for defined risk
      const beyond = isCall ? oBook.filter(c => c.strike <= stop) : oBook.filter(c => c.strike >= stop);
      const shortC = beyond.length ? (isCall ? beyond[beyond.length - 1] : beyond[0]) : null;
      if (shortC) {
        const idx = oBook.findIndex(c => c.strike === shortC.strike);
        const longC = isCall ? oBook[idx - 1] : oBook[idx + 1];
        if (longC) {
          const net = shortC.bid - longC.ask;
          const width = Math.abs(shortC.strike - longC.strike);
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
      }
    }

    return json({
      symbol, spot, direction, target, stop,
      expiry: new Date(chosen.ts).toISOString().slice(0, 10),
      dte: +chosen.dte.toFixed(1),
      expirySelection: {
        distanceToTarget: +distance.toFixed(2),
        dailyAtr: +atr.toFixed(2),
        atrDaysToTarget: +atrDays.toFixed(1),
        requiredDays,
        reason: `The target is ${atrDays.toFixed(1)} daily ATRs away. Price does not travel in a straight line, so the expiry needs roughly ${requiredDays} days for the move to have a fair chance — anything shorter and theta decides the trade before direction does.`,
        alternatives: expiries.slice(0, 10).map(e => ({ date: new Date(e.ts).toISOString().slice(0, 10), dte: +e.dte.toFixed(1), sufficient: e.dte >= requiredDays })),
      },
      earningsInWindow,
      atmIv: atm?.iv ?? null,
      structures,
      assumption: 'Value at target assumes implied vol is UNCHANGED and the move arrives in about ' + arriveDays.toFixed(1) + ' days. Both are estimates: a correct directional call can still lose money if IV collapses, which is what typically happens right after earnings.',
      source: 'Yahoo option chain. Implied vol solved from each contract mid by bisection rather than taken from the feed, which returns unusable values. Contracts without a two-sided quote are excluded.',
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
