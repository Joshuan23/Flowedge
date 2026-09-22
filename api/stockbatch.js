export const config = { runtime: 'edge' };

// Batched stock signals — the whole S&P 500, scored on the same scale as the
// single-symbol engine.
//
// WHY THIS EXISTS: /api/stocksignal makes roughly eight upstream requests per
// symbol (two option chains, options flow, dark pool, candles) at about three
// seconds each. Across 540 names that is nearly half an hour, so the scanner
// could only ever deep-scan a top slice and the rest of the index went unseen.
//
// SOURCE, AND WHY IT CHANGED: this was built CBOE-first. That was wrong at
// scale. CBOE rate-limits per source IP and Vercel's edge egress is shared, so
// a full-index pass scored 58/540, then 284/540 after backoff and caching,
// before the IP was blocked outright. Yahoo, measured properly during market
// hours, is better on every axis that matters here:
//
//   40 symbols x 3 expiries = 120 requests in 2.07s, every response a 200,
//   3.0MB total, two-sided quotes on 40 of 40 symbols.
//   Extrapolated to the index: ~28s and 40MB, against CBOE's 228s and 418MB.
//
// An earlier note in this file claimed Yahoo had no usable bid/ask. That was
// measured at 09:28 ET, two minutes before the open, when the whole chain is
// zeros. During the session Yahoo quotes fine, so the call-premium factor works
// and Yahoo rows now reach the same 92% ceiling CBOE rows do. Three expiries are
// pulled rather than one, so the GEX profile is not front-month only.
//
// CBOE remains the fallback for anything Yahoo cannot serve.
//
// SCORED IDENTICALLY, NOT APPROXIMATELY. The factor weights, the king-node bias
// formula and the confidence normaliser are the same ones /api/stocksignal
// uses, so batch and detail scores sit on one scale. Dark pool is the only
// input neither chain supplies, which is why the ceiling is 92%, not 100%.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const CBOE = 'https://cdn.cboe.com/api/global/delayed_quotes/options/';

// Yahoo is the fallback when CBOE rate-limits, and it is a good one for breadth:
// measured at 30 chains in 592ms with every response a 200, and 30KB per chain
// against CBOE's 790KB — 26x smaller. What it costs is depth. Yahoo returns one
// expiry per request and carries no reliable bid/ask, so the call-premium factor
// is unavailable and the GEX profile is front-expiry only. That is a real
// quality drop, so rows say which source produced them and the confidence
// ceiling falls accordingly rather than pretending parity.
const npdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
function bsGamma(S, K, T, sigma, r = 0.04) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return npdf(d1) / (S * sigma * Math.sqrt(T));
}

// SPY261231C00631000 -> { expMs, isCall, strike }
function parseOcc(sym) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || '');
  if (!m) return null;
  return {
    expMs: Date.UTC(2000 + Number(m[2]), Number(m[3]) - 1, Number(m[4]), 20, 0, 0),
    isCall: m[5] === 'C',
    strike: Number(m[6]) / 1000,
  };
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

// Yahoo chain across several expiries, shaped so one scorer handles any source
async function yahooContracts(symbol, wantExpiries = 3) {
  const { cookie, crumb } = await getYahooAuth();
  const H = { 'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json' };
  const base = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const r = await fetch(`${base}?crumb=${encodeURIComponent(crumb)}`, { headers: H });
  if (!r.ok) return null;
  const root = (await r.json())?.optionChain?.result?.[0];
  const spot = root?.quote?.regularMarketPrice;
  if (!root || !spot) return null;

  const chains = [root.options?.[0]].filter(Boolean);
  const more = (root.expirationDates || []).slice(1, wantExpiries);
  const rest = await Promise.all(more.map(d =>
    fetch(`${base}?date=${d}&crumb=${encodeURIComponent(crumb)}`, { headers: H })
      .then(x => x.ok ? x.json() : null).catch(() => null)));
  for (const x of rest) {
    const o = x?.optionChain?.result?.[0]?.options?.[0];
    if (o) chains.push(o);
  }

  const out = [];
  for (const opt of chains) {
    const expMs = (opt.expirationDate || 0) * 1000;
    const dte = Math.max(0.5, (expMs - Date.now()) / 86400000);
    const T = dte / 365;
    const take = (list, isCall) => {
      for (const c of list || []) {
        const K = Number(c.strike);
        const iv = Number(c.impliedVolatility) || 0;
        // Yahoo's IV field is unreliable at the edges; clamp rather than trust
        if (!K || iv <= 0.01 || iv > 5) continue;
        out.push({
          strike: K, isCall, expMs,
          open_interest: Number(c.openInterest) || 0,
          volume: Number(c.volume) || 0,
          iv, gamma: bsGamma(spot, K, T, iv),
          bid: Number(c.bid) || 0, ask: Number(c.ask) || 0,
        });
      }
    };
    take(opt.calls, true);
    take(opt.puts, false);
  }
  return out.length ? { spot, contracts: out } : null;
}

// CBOE rate-limits per source IP, and Vercel's edge egress is shared — measured
// from the edge it starts returning 429 after roughly 60 symbols, while the same
// requests from a dedicated IP sustain 21/s cleanly. So a 429 is expected under
// load rather than exceptional, and is retried with backoff instead of being
// reported as a dead symbol.
async function fetchChain(symbol) {
  const delays = [0, 600, 1800];
  let last = 0;
  for (const d of delays) {
    if (d) await new Promise(r => setTimeout(r, d));
    const res = await fetch(`${CBOE}${symbol}.json`, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (res.ok) return { res, status: 200 };
    last = res.status;
    if (res.status !== 429) break;          // only backoff is worth retrying
  }
  return { res: null, status: last };
}

async function scoreSymbol(symbol) {
  let spot = null, raw = [], source = 'yahoo';
  // Yahoo first: faster, far smaller, and not rate limited at index scale
  try {
    const y = await yahooContracts(symbol);
    if (y) { spot = y.spot; raw = y.contracts; }
  } catch { /* fall through to CBOE */ }

  if (!spot || !raw.length) {
    const { res, status } = await fetchChain(symbol);
    if (res) {
      const data = await res.json();
      spot = Number(data?.data?.current_price) || null;
      raw = (data?.data?.options || []).map(o => {
        const p = parseOcc(o.option);
        return p ? { ...o, strike: p.strike, isCall: p.isCall, expMs: p.expMs } : null;
      }).filter(Boolean);
      source = 'cboe';
    }
    if (!spot || !raw.length) {
      return { symbol, error: status === 429 ? 'rate limited' : `no chain (${status || 'n/a'})` };
    }
  }

  const now = Date.now();
  const byStrike = new Map();
  const book = [];
  let callVol = 0, putVol = 0, callOI = 0, putOI = 0, callNotional = 0, putNotional = 0;
  let unusualCallN = 0, unusualPutN = 0, unusualCount = 0;
  let atmIv = null, atmDist = Infinity;
  // Chain depth near the money. A high confluence score on a hollow chain is
  // the single most misleading thing this scan can produce: the bias factor
  // saturates on a handful of contracts and reads like conviction.
  const atmSpreads = [];
  let atmOi = 0;

  for (const p of raw) {
    const o = p;
    // GEX aggregation stays in the ±15% band the single-symbol engine uses, so
    // the two produce the same profile. The FLIP book is collected wider,
    // because for a 50%-IV single stock ±15% is well under one standard
    // deviation and net gamma simply never crosses inside it — that was leaving
    // the flip null on NVDA, META, MSFT and others.
    const bandPct = Math.abs(p.strike - spot) / spot;
    if (bandPct > 0.30) continue;
    const inGexBand = bandPct <= 0.15;
    const dte = (p.expMs - now) / 86400000;
    if (dte < 0) continue;
    const oi = Number(o.open_interest) || 0;
    const vol = Number(o.volume) || 0;
    const bid = Number(o.bid) || 0, ask = Number(o.ask) || 0;
    const iv = Number(o.iv) || 0;
    const gamma = Number(o.gamma) || 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

    if (oi > 0 && gamma > 0 && iv > 0) {
      const wAll = dte < 1 ? 0.25 : dte < 3 ? 0.6 : dte < 7 ? 0.85 : 1.0;
      book.push({ K: p.strike, T: Math.max(0.5, dte) / 365, sigma: iv, oi, isCall: p.isCall, w: wAll });
    }
    if (!inGexBand) continue;

    if (p.isCall) { callVol += vol; callOI += oi; } else { putVol += vol; putOI += oi; }
    if (mid > 0 && vol > 0) {
      const notional = vol * mid * 100;
      if (p.isCall) callNotional += notional; else putNotional += notional;
      // Volume above standing open interest is NEW positioning
      if (oi === 0 || vol / Math.max(oi, 1) >= 1) {
        unusualCount++;
        if (p.isCall) unusualCallN += notional; else unusualPutN += notional;
      }
    }
    // At-the-money IV for the nearest meaningful expiry
    const d = Math.abs(p.strike - spot) + Math.abs(dte - 7);
    if (iv > 0 && d < atmDist) { atmDist = d; atmIv = iv; }

    if (Math.abs(p.strike - spot) / spot <= 0.05) {
      atmOi += oi;
      if (bid > 0 && ask > 0) atmSpreads.push((ask - bid) / ((bid + ask) / 2) * 100);
    }

    if (oi <= 0 || gamma <= 0) continue;
    // Same short-dated discount as the single-symbol engine
    const w = dte < 1 ? 0.25 : dte < 3 ? 0.6 : dte < 7 ? 0.85 : 1.0;
    const gex = oi * gamma * 100 * spot * w;

    if (!byStrike.has(p.strike)) byStrike.set(p.strike, { strike: p.strike, callOI: 0, putOI: 0, callVol: 0, putVol: 0, callGex: 0, putGex: 0, gex: 0 });
    const s = byStrike.get(p.strike);
    if (p.isCall) { s.callOI += oi; s.callVol += vol; s.callGex += gex; s.gex += gex; }
    else          { s.putOI  += oi; s.putVol  += vol; s.putGex  += gex; s.gex -= gex; }
  }

  const gexByStrike = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  if (!gexByStrike.length) return { symbol, error: 'no strikes in band' };

  const netGex = gexByStrike.reduce((a, x) => a + x.gex, 0);
  const gammaWall = gexByStrike.reduce((m, x) => x.gex > m.gex ? x : m).strike;
  const callWall = gexByStrike.filter(x => x.strike >= spot && x.callOI > 0)
    .reduce((m, x) => x.callOI > m.callOI ? x : m, { callOI: 0, strike: null }).strike;
  const putWall = gexByStrike.filter(x => x.strike <= spot && x.putOI > 0)
    .reduce((m, x) => x.putOI > m.putOI ? x : m, { putOI: 0, strike: null }).strike;

  // Identical king-node bias formula to /api/gamma, so the two agree
  const scoreNode = (x, side) => {
    const g = side === 'buy' ? x.callGex : x.putGex;
    const v = side === 'buy' ? x.callVol : x.putVol;
    return g * (1 + Math.log1p(v));
  };
  const buyKing = gexByStrike.filter(x => x.strike > spot && x.callGex > 0)
    .map(x => ({ ...x, score: scoreNode(x, 'buy') })).sort((a, b) => b.score - a.score)[0] ?? null;
  const sellKing = gexByStrike.filter(x => x.strike < spot && x.putGex > 0)
    .map(x => ({ ...x, score: scoreNode(x, 'sell') })).sort((a, b) => b.score - a.score)[0] ?? null;
  const totalScore = (buyKing?.score ?? 0) + (sellKing?.score ?? 0);
  const biasScore = totalScore > 0 ? ((buyKing?.score ?? 0) - (sellKing?.score ?? 0)) / totalScore : 0;

  // Gamma flip by re-pricing the book at candidate spots — the same definition
  // the rest of the app settled on after the naive version was found wrong
  let flipLevel = null;
  if (book.length) {
    const netAt = S => book.reduce((t, c) => t + (c.isCall ? 1 : -1) * bsGamma(S, c.K, c.T, c.sigma) * 100 * S * c.w * c.oi, 0);
    // ±25%, matching the wider book. A narrow scan was the other half of why
    // high-IV names returned no flip.
    const lo = spot * 0.75, hi = spot * 1.25, steps = 80;
    let pS = lo, pV = netAt(lo);
    for (let i = 1; i <= steps; i++) {
      const S = lo + (hi - lo) * (i / steps), v = netAt(S);
      if ((pV < 0 && v >= 0) || (pV > 0 && v <= 0)) {
        let a = pS, b = S, fa = pV;
        for (let k = 0; k < 40; k++) {
          const m = (a + b) / 2, fm = netAt(m);
          if ((fa < 0 && fm >= 0) || (fa > 0 && fm <= 0)) b = m; else { a = m; fa = fm; }
        }
        flipLevel = +((a + b) / 2).toFixed(2);
        break;
      }
      pS = S; pV = v;
    }
  }

  // ---- Same factor weights as /api/stocksignal ----
  const factors = [];
  let maxAvailable = 0;
  const avail = (w, present) => { if (present) maxAvailable += w; };
  const add = (name, score) => factors.push({ name, score: +score.toFixed(2) });

  avail(2.0, Number.isFinite(biasScore));
  if (Math.abs(biasScore) > 0.05) add(`Dealer GEX bias ${biasScore > 0 ? '+' : ''}${biasScore.toFixed(2)}`, biasScore * 2);

  avail(0.5, !!flipLevel);
  if (flipLevel) add(`${spot > flipLevel ? 'Above' : 'Below'} gamma flip ${flipLevel}`, spot > flipLevel ? 0.5 : -0.5);

  const cps = callNotional + putNotional > 0 ? +(callNotional / (callNotional + putNotional) * 100).toFixed(1) : null;
  avail(1.0, cps != null);
  if (cps != null) {
    const s = cps > 62 ? 1.0 : cps > 55 ? 0.5 : cps < 38 ? -1.0 : cps < 45 ? -0.5 : 0;
    if (s !== 0) add(`Call premium share ${cps}%`, s);
  }

  avail(0.75, unusualCount > 0);
  if (unusualCallN + unusualPutN > 0) {
    const share = unusualCallN / (unusualCallN + unusualPutN);
    const s = share > 0.7 ? 0.75 : share > 0.58 ? 0.4 : share < 0.3 ? -0.75 : share < 0.42 ? -0.4 : 0;
    if (s !== 0) add(`Unusual activity ${Math.round(share * 100)}% calls`, s);
  }

  const pc = callVol > 0 ? +(putVol / callVol).toFixed(2) : null;
  avail(0.6, pc != null && pc > 0);
  if (pc != null && pc > 0) {
    const s = pc > 1.4 ? 0.6 : pc > 1.15 ? 0.3 : pc < 0.6 ? -0.6 : pc < 0.85 ? -0.3 : 0;
    if (s !== 0) add(`Put/call volume ${pc}`, s);
  }
  // Dark pool (0.4) is the one factor CBOE cannot supply — never counted as
  // available, which is why the ceiling here tops out at 92%

  const med = arr => { const q = arr.slice().sort((a, b) => a - b); return q.length ? q[Math.floor(q.length / 2)] : null; };
  const medSpread = med(atmSpreads);
  // Open interest leads, spread is a veto. Percentage spreads are naturally
  // wide on cheap out-of-the-money strikes, so gating on them alone mislabelled
  // SPY — 302,000 contracts open near the money — as merely "ok". Measured
  // across the index: mega-caps run 120k-300k, a mid-cap like JPM ~22k, and the
  // names that topped the last scan (ATO 943, GL 598) are hollow.
  const brokenQuotes = medSpread != null && medSpread > 25;
  const chainTier = brokenQuotes ? 'thin'
    : atmOi >= 50000 ? 'deep'
    : atmOi >= 10000 ? 'ok' : 'thin';

  const rawScore = factors.reduce((a, f) => a + f.score, 0);
  const MAX = 5.25;
  return {
    symbol, spot, source,
    chain: {
      tier: chainTier,
      atmOpenInterest: atmOi,
      medianAtmSpreadPct: medSpread != null ? +medSpread.toFixed(1) : null,
      note: chainTier === 'deep'
        ? 'Deep chain — the score rests on real open interest.'
        : chainTier === 'ok'
          ? `Workable — ${atmOi.toLocaleString()} contracts open near the money, thinner than a mega-cap but real.`
          : brokenQuotes
            ? `Quotes are ${medSpread.toFixed(0)}% wide near the money. Whatever the score says, the spread eats the trade before direction matters.`
            : `Hollow chain: only ${atmOi.toLocaleString()} contracts open near the money. A high score here rests on a handful of contracts, not conviction — treat it with far more suspicion than the same number on a liquid name.`,
    },
    confidence: Math.min(100, Math.round(Math.abs(rawScore) / MAX * 100)),
    confidenceCeiling: Math.round(maxAvailable / MAX * 100),
    direction: rawScore > 0 ? 'LONG' : 'SHORT',
    rawScore: +rawScore.toFixed(2),
    factors,
    netGex: Math.round(netGex), gammaWall, callWall, putWall, flipLevel,
    biasScore: +biasScore.toFixed(3),
    atmIv: atmIv ? +(atmIv * 100).toFixed(1) : null,
    callPremiumShare: cps, pcVolume: pc, unusualCount,
  };
}

export default async function handler(req) {
  const u = new URL(req.url);
  const list = (u.searchParams.get('symbols') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!list.length) return json({ error: 'symbols required' }, 400);
  // Each chain averages ~790KB, so the batch is bounded to keep one request
  // comfortably inside the edge budget
  const symbols = list.slice(0, 25);

  try {
    const t0 = Date.now();
    const out = [];
    const CONC = 5;
    for (let i = 0; i < symbols.length; i += CONC) {
      const batch = await Promise.all(symbols.slice(i, i + CONC).map(s =>
        scoreSymbol(s).catch(e => ({ symbol: s, error: e.message }))));
      out.push(...batch);
    }
    const ok = out.filter(r => !r.error);
    const bySource = {};
    for (const r of ok) bySource[r.source] = (bySource[r.source] || 0) + 1;
    return json({
      requested: symbols.length,
      scored: ok.length,
      failed: out.length - ok.length,
      rateLimited: out.filter(r => r.error === 'rate limited').length,
      bySource,
      tradeable: ok.filter(r => r.chain.tier !== 'thin').length,
      results: out,
      elapsedMs: Date.now() - t0,
      note: 'Scored on the same factor weights as /api/stocksignal. Dark pool is the one input CBOE cannot supply, so the confidence ceiling here is 92% rather than 100% — open a symbol for the full read.',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
