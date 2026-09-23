// Shared option-chain access for the equity option endpoints.
//
// WHY THIS EXISTS: /api/strikeladder and /api/optionpick were both built
// CBOE-first, because CBOE publishes real two-sided markets with
// exchange-computed greeks. That is still the best chain when it is fresh — but
// on 2026-09-23 the entire feed froze at 03:00-04:00 while the market was open,
// leaving SLV 4.11% adrift and every derived number silently wrong. Blocking on
// staleness was the right first response; it is not a fix, because it leaves
// the app with nothing to say.
//
// Yahoo's chain is live during the session (verified quoting to the second) and
// carries two-sided markets, so it is the fallback. What it lacks is greeks and
// a trustworthy IV field — Yahoo returned 0.00001 on an at-the-money call — so
// implied vol is solved from each contract's own mid by bisection and every
// greek is derived from that. Slower and less precise than the exchange's own
// numbers, but correct against a live price, which matters more.
//
// Underscore prefix keeps Vercel from routing this as an endpoint.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const CBOE = 'https://cdn.cboe.com/api/global/delayed_quotes/options/';

export const npdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

export function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = npdf(x);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function bsPrice(S, K, T, sigma, isCall, r = 0.04) {
  if (T <= 0 || sigma <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  const sq = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / sq;
  const d2 = d1 - sq;
  return isCall
    ? S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2)
    : K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1);
}

export function bsGreeks(S, K, T, sigma, isCall, r = 0.04) {
  if (T <= 0 || sigma <= 0) {
    return { delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0), theta: 0, vega: 0 };
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sq);
  const d2 = d1 - sigma * sq;
  const disc = Math.exp(-r * T);
  return {
    delta: isCall ? ncdf(d1) : ncdf(d1) - 1,
    // per-day, which is how theta is actually experienced
    theta: (-(S * npdf(d1) * sigma) / (2 * sq)
      - (isCall ? 1 : -1) * r * K * disc * (isCall ? ncdf(d2) : ncdf(-d2))) / 365,
    vega: S * npdf(d1) * sq / 100,
  };
}

// Bisection rather than Newton: slower, but it cannot diverge on the
// badly-behaved quotes that live in option chains.
export function impliedVol(mkt, S, K, T, isCall) {
  if (!(mkt > 0) || T <= 0) return null;
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  if (mkt < intrinsic - 0.01) return null;
  let lo = 0.01, hi = 5;
  if (bsPrice(S, K, T, hi, isCall) < mkt) return null;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (bsPrice(S, K, T, m, isCall) < mkt) lo = m; else hi = m;
  }
  const v = (lo + hi) / 2;
  return v > 0.02 && v < 4.9 ? v : null;
}

// SPY261231C00631000 -> { expMs, isCall, strike }
export function parseOcc(sym) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || '');
  if (!m) return null;
  return {
    expMs: expiryClose(Date.UTC(2000 + Number(m[2]), Number(m[3]) - 1, Number(m[4]))),
    isCall: m[5] === 'C',
    strike: Number(m[6]) / 1000,
  };
}

// US options settle at 4pm ET. 20:00 UTC is that only during EDT; in EST it
// lands at 3pm, so the hour is checked rather than assumed.
export function expiryClose(dateMs) {
  const d = new Date(dateMs);
  const guess = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20, 0, 0);
  const hourET = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  }).format(new Date(guess)));
  return hourET === 16 ? guess : guess + 3600000;
}

async function livePrice(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`,
      { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    return Number((await r.json())?.chart?.result?.[0]?.meta?.regularMarketPrice) || null;
  } catch { return null; }
}

let yahooAuth = null;
async function getYahooAuth() {
  if (yahooAuth) return yahooAuth;
  const seed = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const cookie = (seed.headers.get('set-cookie') || '').split(',').map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
  const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, 'Cookie': cookie } });
  yahooAuth = { cookie, crumb: (await r.text()).trim() };
  return yahooAuth;
}

async function cboeChain(symbol) {
  const res = await fetch(`${CBOE}${symbol}.json`, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  const spot = Number(data?.data?.current_price) || null;
  if (!spot) return null;

  const contracts = [];
  for (const o of data.data.options || []) {
    const p = parseOcc(o.option);
    if (!p) continue;
    const bid = Number(o.bid) || 0, ask = Number(o.ask) || 0;
    if (bid <= 0 || ask <= 0) continue;
    contracts.push({
      ...p, bid, ask, mid: (bid + ask) / 2,
      bidSize: Number(o.bid_size) || 0, askSize: Number(o.ask_size) || 0,
      iv: Number(o.iv) || 0,
      delta: Number(o.delta) || 0, theta: Number(o.theta) || 0, vega: Number(o.vega) || 0,
      oi: Number(o.open_interest) || 0, volume: Number(o.volume) || 0,
    });
  }
  return { spot, contracts, timestamp: data?.timestamp || null };
}

async function yahooChain(symbol, maxExpiries = 8) {
  const { cookie, crumb } = await getYahooAuth();
  const H = { 'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json' };
  const base = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const r = await fetch(`${base}?crumb=${encodeURIComponent(crumb)}`, { headers: H });
  if (!r.ok) return null;
  const root = (await r.json())?.optionChain?.result?.[0];
  const spot = Number(root?.quote?.regularMarketPrice) || null;
  if (!root || !spot) return null;

  const chains = [root.options?.[0]].filter(Boolean);
  const more = (root.expirationDates || []).slice(1, maxExpiries);
  const rest = await Promise.all(more.map(d =>
    fetch(`${base}?date=${d}&crumb=${encodeURIComponent(crumb)}`, { headers: H })
      .then(x => x.ok ? x.json() : null).catch(() => null)));
  for (const x of rest) {
    const o = x?.optionChain?.result?.[0]?.options?.[0];
    if (o) chains.push(o);
  }

  const now = Date.now();
  const contracts = [];
  for (const opt of chains) {
    // Yahoo stamps expiry as UTC midnight of the date; the real deadline is the
    // 4pm ET close, and using the raw value puts today's expiry in the past
    const expMs = expiryClose((opt.expirationDate || 0) * 1000);
    const T = Math.max((expMs - now) / 86400000, 0) / 365;
    const take = (list, isCall) => {
      for (const c of list || []) {
        const K = Number(c.strike);
        const bid = Number(c.bid) || 0, ask = Number(c.ask) || 0;
        if (!K || bid <= 0 || ask <= 0) continue;
        const mid = (bid + ask) / 2;
        // Yahoo's own IV field is unusable, so solve it from the market price
        const iv = impliedVol(mid, spot, K, T, isCall);
        if (!iv) continue;
        const g = bsGreeks(spot, K, T, iv, isCall);
        contracts.push({
          expMs, isCall, strike: K, bid, ask, mid,
          // Yahoo publishes no size at the touch; open interest and volume are
          // the liquidity evidence available, and callers must not read 0 as
          // "no size" when it means "not reported"
          bidSize: 0, askSize: 0, sizeUnknown: true,
          iv, delta: g.delta, theta: g.theta, vega: g.vega,
          oi: Number(c.openInterest) || 0, volume: Number(c.volume) || 0,
        });
      }
    };
    take(opt.calls, true);
    take(opt.puts, false);
  }
  return contracts.length ? { spot, contracts, timestamp: null } : null;
}

// Returns a usable chain, preferring CBOE while it is fresh and falling back to
// Yahoo when it is not. The result always says which source produced it.
export async function getChain(symbol, maxExpiries = 8) {
  const [cboe, live] = await Promise.all([
    cboeChain(symbol).catch(() => null),
    livePrice(symbol),
  ]);

  if (cboe) {
    const driftPct = live ? (cboe.spot - live) / live * 100 : null;
    const ageMin = cboe.timestamp
      ? Math.round((Date.now() - new Date(String(cboe.timestamp).replace(' ', 'T') + 'Z').getTime()) / 60000)
      : null;
    const stale = driftPct != null && Math.abs(driftPct) > 0.3;
    if (!stale) {
      return { ...cboe, source: 'cboe', livePrice: live, driftPct, ageMinutes: ageMin, degraded: false };
    }
    const y = await yahooChain(symbol, maxExpiries).catch(() => null);
    if (y) {
      return {
        ...y, source: 'yahoo', livePrice: live, degraded: true,
        note: `CBOE had ${symbol} at ${cboe.spot} against a live ${live} (${driftPct > 0 ? '+' : ''}${driftPct.toFixed(2)}% adrift, snapshot ${ageMin} minutes old), so the live Yahoo chain is used instead. Greeks and implied vol are solved from each contract's mid rather than published by the exchange, and Yahoo reports no size at the touch — open interest and volume are the liquidity evidence here.`,
      };
    }
    return { ...cboe, source: 'cboe', livePrice: live, driftPct, ageMinutes: ageMin, degraded: false, stale: true };
  }

  const y = await yahooChain(symbol, maxExpiries).catch(() => null);
  if (y) return { ...y, source: 'yahoo', livePrice: live, degraded: true, note: 'CBOE unavailable; live Yahoo chain used, with implied vol and greeks solved from each contract mid.' };
  return null;
}
