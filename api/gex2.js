export const config = { runtime: 'edge' };

// Independent GEX — computed from YAHOO's option chain, deliberately sharing no
// inputs with /api/gamma.js (which reads NASDAQ). Two independent estimates of
// the same quantity are worth far more than one: when both put the gamma wall
// at the same strike you can lean on it, and when they disagree that is itself
// the signal that the level is soft.
//
// One genuine methodological upgrade over the NASDAQ path: Yahoo publishes
// per-contract implied volatility, so each strike's gamma uses its own IV
// instead of one historical-vol estimate applied to the whole chain. That
// matters most at the wings, where skew makes a single sigma badly wrong.

function normalPDF(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

// Black-Scholes gamma. Same formula as api/gamma.js so the two estimates are
// directly comparable and any divergence comes from the DATA, not the math.
function bsGamma(S, K, T, sigma, r = 0.05) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// Yahoo now gates the options endpoint behind a cookie + crumb pair
async function getCrumb() {
  const seed = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const setCookie = seed.headers.get('set-cookie') || '';
  const cookie = setCookie.split(',').map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
  const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
  });
  const crumb = (await res.text()).trim();
  return { cookie, crumb };
}

export default async function handler(req) {
  const url    = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || 'SPY').toUpperCase();
  const maxExp = Math.min(parseInt(url.searchParams.get('expiries') || '4', 10) || 4, 8);

  try {
    const { cookie, crumb } = await getCrumb();
    if (!crumb) return json({ error: 'Could not obtain Yahoo crumb', symbol }, 502);

    const headers = { 'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json' };
    const first = await fetch(`https://query1.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${encodeURIComponent(crumb)}`, { headers });
    if (!first.ok) return json({ error: `Yahoo HTTP ${first.status}`, symbol }, first.status);

    const firstData = await first.json();
    const root = firstData?.optionChain?.result?.[0];
    if (!root) return json({ error: firstData?.finance?.error?.description || 'No chain returned', symbol }, 404);

    const spot = root.quote?.regularMarketPrice;
    if (!spot) return json({ error: 'No spot price', symbol }, 404);

    // Pull the nearest N expiries — gamma concentrates in the front, and each
    // extra expiry is another round trip
    const expDates = (root.expirationDates || []).slice(0, maxExp);
    const chains = [root];
    const rest = await Promise.all(
      expDates.slice(1).map(d =>
        fetch(`https://query1.finance.yahoo.com/v7/finance/options/${symbol}?date=${d}&crumb=${encodeURIComponent(crumb)}`, { headers })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      )
    );
    for (const r of rest) {
      const res = r?.optionChain?.result?.[0];
      if (res) chains.push(res);
    }

    const now = Date.now();
    const byStrike = new Map();
    // Per-contract terms are kept so net GEX can be re-evaluated at hypothetical
    // spot prices — that is what locating the true gamma flip requires
    const book = [];
    let totalCallVol = 0, totalPutVol = 0, contracts = 0, expiriesUsed = 0;

    for (const chain of chains) {
      const opt = chain.options?.[0];
      if (!opt) continue;
      expiriesUsed++;
      const expMs = (opt.expirationDate || 0) * 1000;
      const dteRaw = (expMs - now) / 86400000;
      const dte = Math.max(0.5, dteRaw);          // 0DTE floored so gamma doesn't blow up
      const T = dte / 365;
      // Very short expiries carry enormous per-contract gamma that decays within
      // hours; discount them so one 0DTE strike can't dominate the profile
      const w = dte < 1 ? 0.25 : dte < 3 ? 0.6 : dte < 7 ? 0.85 : 1.0;

      const side = (list, isCall) => {
        for (const c of list || []) {
          const K = Number(c.strike);
          if (!K || Math.abs(K - spot) / spot > 0.15) continue;   // ±15% band, as in gamma.js
          const oi  = Number(c.openInterest) || 0;
          const vol = Number(c.volume) || 0;
          const iv  = Number(c.impliedVolatility) || 0;
          if (oi <= 0 && vol <= 0) continue;
          contracts++;
          if (isCall) totalCallVol += vol; else totalPutVol += vol;

          // Per-contract IV is the upgrade here; clamp to sane bounds because
          // Yahoo occasionally returns absurd IV on stale far-OTM quotes
          const sigma = iv > 0.01 && iv < 5 ? iv : 0.25;
          const g = bsGamma(spot, K, T, sigma) * 100 * spot * w;

          if (oi > 0) book.push({ K, T, sigma, oi, isCall, w });

          if (!byStrike.has(K)) byStrike.set(K, { strike: K, callOI: 0, putOI: 0, callVol: 0, putVol: 0, callGex: 0, putGex: 0, gex: 0 });
          const s = byStrike.get(K);
          if (isCall) { s.callOI += oi; s.callVol += vol; s.callGex += oi * g; s.gex += oi * g; }
          else        { s.putOI  += oi; s.putVol  += vol; s.putGex  += oi * g; s.gex -= oi * g; }
        }
      };
      side(opt.calls, true);
      side(opt.puts, false);
    }

    const gexByStrike = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
    if (!gexByStrike.length) return json({ error: 'No strikes in range', symbol, spot }, 404);

    const netGex = gexByStrike.reduce((s, x) => s + x.gex, 0);
    const gammaWall = gexByStrike.reduce((m, x) => x.gex > m.gex ? x : m).strike;
    const callWall = gexByStrike.filter(x => x.strike >= spot && x.callOI > 0)
      .reduce((m, x) => x.callOI > m.callOI ? x : m, { callOI: 0, strike: null }).strike;
    const putWall = gexByStrike.filter(x => x.strike <= spot && x.putOI > 0)
      .reduce((m, x) => x.putOI > m.putOI ? x : m, { putOI: 0, strike: null }).strike;

    // Gamma flip — the SPOT price at which dealer net gamma changes sign, found
    // by re-pricing the whole book at candidate spots and bisecting the zero
    // crossing. Walking cumulative GEX across strikes (the common shortcut) is
    // a different quantity and frequently never crosses at all, which is
    // exactly what it did here before this was fixed.
    const netGexAt = (S) => {
      let t = 0;
      for (const c of book) {
        const g = bsGamma(S, c.K, c.T, c.sigma) * 100 * S * c.w * c.oi;
        t += c.isCall ? g : -g;
      }
      return t;
    };

    let flipLevel = null;
    const lo = spot * 0.90, hi = spot * 1.10;
    const steps = 40;
    let prevS = lo, prevV = netGexAt(lo);
    for (let i = 1; i <= steps; i++) {
      const S = lo + (hi - lo) * (i / steps);
      const v = netGexAt(S);
      if ((prevV < 0 && v >= 0) || (prevV > 0 && v <= 0)) {
        // Bisect the bracketed interval for a level that isn't grid-snapped
        let a = prevS, b = S, fa = prevV;
        for (let k = 0; k < 40; k++) {
          const m = (a + b) / 2, fm = netGexAt(m);
          if ((fa < 0 && fm >= 0) || (fa > 0 && fm <= 0)) b = m; else { a = m; fa = fm; }
        }
        flipLevel = (a + b) / 2;
        break;
      }
      prevS = S; prevV = v;
    }

    return json({
      symbol, spot,
      netGex,
      gammaWall, callWall, putWall,
      flipLevel: flipLevel != null ? +flipLevel.toFixed(2) : null,
      gexByStrike: gexByStrike.map(x => ({ ...x, gex: Math.round(x.gex), callGex: Math.round(x.callGex), putGex: Math.round(x.putGex) })),
      totalCallVol, totalPutVol,
      pcVolumeRatio: totalCallVol > 0 ? +(totalPutVol / totalCallVol).toFixed(2) : null,
      expiriesUsed, contracts,
      source: 'Yahoo Finance option chain, per-contract implied vol',
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
      'Cache-Control': 's-maxage=120, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
