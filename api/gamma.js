function normalPDF(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
function bsGamma(S, K, T, sigma, r = 0.05) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

const IV = { SPY: 0.14, QQQ: 0.18, NVDA: 0.55, AAPL: 0.27, TSLA: 0.65, META: 0.38, MSFT: 0.24, AMD: 0.55 };
const ASSET_CLASS = { SPY: 'etf', QQQ: 'etf', IWM: 'etf', GLD: 'etf', TLT: 'etf' };

function parseNum(s) {
  if (!s || s === '--') return 0;
  return parseInt(String(s).replace(/,/g, '')) || 0;
}
function parseDTE(expiryDate) {
  if (!expiryDate || expiryDate === '--') return 7;
  const now = new Date(); const year = now.getFullYear();
  const d = new Date(`${expiryDate} ${year}`);
  if (isNaN(d)) return 7;
  if (d < now) d.setFullYear(year + 1);
  return Math.max(1, Math.ceil((d - now) / 86400000));
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'SPY').toUpperCase();
  const filterExpiry = searchParams.get('expiry') || null;
  const assetclass = ASSET_CLASS[symbol] || 'stocks';
  const sigma = IV[symbol] || 0.30;

  try {
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
    const availableExpiries = [...new Set(rows.filter(r => r.expiryDate && r.expiryDate !== '--').map(r => r.expiryDate))];

    const strikeMap = {};
    let totalCallVol = 0, totalPutVol = 0;

    for (const row of rows) {
      const k = parseFloat(row.strike);
      if (!k || Math.abs(k - spot) / spot > 0.15) continue;
      if (filterExpiry && row.expiryDate !== filterExpiry) continue;

      const dte = parseDTE(row.expiryDate);
      const T = dte / 365;
      const gamma = bsGamma(spot, k, T, sigma);
      const cOI = parseNum(row.c_Openinterest), pOI = parseNum(row.p_Openinterest);
      const cVol = parseNum(row.c_Volume), pVol = parseNum(row.p_Volume);
      const gex = (cOI - pOI) * gamma * 100 * spot;

      totalCallVol += cVol;
      totalPutVol += pVol;

      if (!strikeMap[k]) strikeMap[k] = { strike: k, callOI: 0, putOI: 0, callVol: 0, putVol: 0, gex: 0, expiryDate: row.expiryDate, dte };
      strikeMap[k].callOI += cOI;
      strikeMap[k].putOI += pOI;
      strikeMap[k].callVol += cVol;
      strikeMap[k].putVol += pVol;
      strikeMap[k].gex += gex;
    }

    const gexByStrike = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
    if (!gexByStrike.length) throw new Error('No options data available');

    const netGex = gexByStrike.reduce((s, x) => s + x.gex, 0);
    const gammaWall = gexByStrike.reduce((max, x) => x.gex > max.gex ? x : max).strike;
    const putWall = gexByStrike.filter(x => x.strike <= spot && x.putOI > 0)
      .reduce((max, x) => x.putOI > max.putOI ? x : max, { putOI: 0, strike: null }).strike;
    const callWall = gexByStrike.filter(x => x.strike >= spot && x.callOI > 0)
      .reduce((max, x) => x.callOI > max.callOI ? x : max, { callOI: 0, strike: null }).strike;
    const flipCandidate = gexByStrike.find(x => x.gex > 0 && x.strike >= spot * 0.92);
    const flipLevel = flipCandidate?.strike ?? null;
    const pcVolumeRatio = totalCallVol > 0 ? (totalPutVol / totalCallVol).toFixed(2) : null;

    return new Response(JSON.stringify({
      symbol, spot, netGex, gammaWall, putWall, callWall, flipLevel,
      totalCallVol, totalPutVol, pcVolumeRatio,
      availableExpiries,
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
