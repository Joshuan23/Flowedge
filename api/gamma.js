// Black-Scholes gamma: rate of change of delta per $1 move
function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function bsGamma(S, K, T, sigma, r = 0.05) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

// Typical IV per symbol
const IV = { SPY: 0.14, QQQ: 0.18, NVDA: 0.55, AAPL: 0.27, TSLA: 0.65, META: 0.38, MSFT: 0.24, AMD: 0.55 };
const ASSET_CLASS = { SPY: 'etf', QQQ: 'etf', IWM: 'etf', GLD: 'etf', TLT: 'etf' };

function parseOI(s) {
  if (!s || s === '--') return 0;
  return parseInt(String(s).replace(/,/g, '')) || 0;
}

function parseDTE(expiryDate) {
  if (!expiryDate || expiryDate === '--') return 7;
  const now = new Date();
  const year = now.getFullYear();
  const d = new Date(`${expiryDate} ${year}`);
  if (isNaN(d)) return 7;
  // If parsed date is in the past, try next year
  if (d < now) d.setFullYear(year + 1);
  const dte = Math.max(1, Math.ceil((d - now) / 86400000));
  return dte;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'SPY').toUpperCase();
  const assetclass = ASSET_CLASS[symbol] || 'stocks';
  const sigma = IV[symbol] || 0.30;

  try {
    // Fetch current price and options chain in parallel
    const [priceRes, optRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }),
      fetch(`https://api.nasdaq.com/api/quote/${symbol}/option-chain?assetclass=${assetclass}&limit=200&expiryoption=allWeeks&callput=callput`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.nasdaq.com/' }
      }),
    ]);

    const priceData = await priceRes.json();
    const optData = await optRes.json();

    const spot = priceData?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!spot) throw new Error('Could not get spot price');

    const rows = optData?.data?.table?.rows || [];

    // Aggregate OI by strike across all expiries
    const strikeMap = {};
    for (const row of rows) {
      const k = parseFloat(row.strike);
      if (!k) continue;
      // Only within ±15% of spot
      if (Math.abs(k - spot) / spot > 0.15) continue;
      const dte = parseDTE(row.expiryDate);
      const T = dte / 365;
      const gamma = bsGamma(spot, k, T, sigma);
      const cOI = parseOI(row.c_Openinterest);
      const pOI = parseOI(row.p_Openinterest);
      // GEX in dollars: dealers are short puts & long calls, so they hedge by selling on moves
      const gex = (cOI - pOI) * gamma * 100 * spot;

      if (!strikeMap[k]) strikeMap[k] = { strike: k, callOI: 0, putOI: 0, gex: 0 };
      strikeMap[k].callOI += cOI;
      strikeMap[k].putOI += pOI;
      strikeMap[k].gex += gex;
    }

    const gexByStrike = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
    if (!gexByStrike.length) throw new Error('No options data available');

    const netGex = gexByStrike.reduce((s, x) => s + x.gex, 0);

    // Gamma wall = strike with highest positive GEX (dealer long gamma = resistance/support)
    const gammaWall = gexByStrike.reduce((max, x) => x.gex > max.gex ? x : max).strike;
    // Put wall = strike with highest put OI below spot (strong support)
    const putWall = gexByStrike
      .filter(x => x.strike <= spot && x.putOI > 0)
      .reduce((max, x) => x.putOI > max.putOI ? x : max, { putOI: 0, strike: null }).strike;
    // Call wall = strike with highest call OI above spot (strong resistance)
    const callWall = gexByStrike
      .filter(x => x.strike >= spot && x.callOI > 0)
      .reduce((max, x) => x.callOI > max.callOI ? x : max, { callOI: 0, strike: null }).strike;
    // Flip level = lowest strike near spot where individual GEX turns positive
    const flipCandidate = gexByStrike.find(x => x.gex > 0 && x.strike >= spot * 0.92);
    const flipLevel = flipCandidate?.strike ?? null;

    return new Response(JSON.stringify({
      symbol, spot, netGex, gammaWall, putWall, callWall, flipLevel,
      gexByStrike,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export const config = { runtime: 'edge' };
