function normalPDF(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
function bsGamma(S, K, T, sigma, r = 0.05) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}

const ETF_SET = new Set([
  'SPY','QQQ','IWM','DIA','MDY','VOO','VTI','VEA','VWO',
  'GLD','SLV','GDX','GDXJ','USO','UNG',
  'TLT','HYG','LQD','IEF','SHY','AGG',
  'XLF','XLK','XLE','XLV','XLI','XLU','XLP','XLB','XLRE','XLY','XLC',
  'EEM','EFA','IEMG','KWEB','MCHI','EWJ','EWZ','EWY',
  'ARKK','ARKG','ARKF','ARKW','ARKQ',
  'TQQQ','SQQQ','SPXL','SPXU','UPRO','UVXY','VXX','SVXY',
  'SMH','SOXX','IGV','CIBR','HACK','LABU','LABD','FAS','FAZ','SOXL','SOXS',
]);

function parseNum(s) {
  if (!s || s === '--') return 0;
  return parseInt(String(s).replace(/,/g, '')) || 0;
}

function parseDTE(expiryDate) {
  if (!expiryDate || expiryDate === '--') return 7;
  const now = new Date();
  // Strip time — compare calendar dates only
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(`${expiryDate} ${now.getFullYear()}`);
  if (isNaN(d)) return 7;
  const expMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Only advance year if expiry is strictly before today
  if (expMidnight < todayMidnight) expMidnight.setFullYear(now.getFullYear() + 1);
  const dte = (expMidnight - todayMidnight) / 86400000;
  return Math.max(0.5, dte); // 0DTE uses 0.5 to avoid gamma blowup
}

// Calculate 30-day realised vol from daily closes, then apply IV premium
function calcIV(closes) {
  if (!closes || closes.length < 5) return 0.20;
  const valid = closes.filter(Boolean);
  const logRets = valid.slice(1).map((c, i) => Math.log(c / valid[i]));
  const mean = logRets.reduce((s, x) => s + x, 0) / logRets.length;
  const variance = logRets.reduce((s, x) => s + (x - mean) ** 2, 0) / logRets.length;
  const hv = Math.sqrt(variance * 252);
  // IV typically trades at a 20-40% premium to HV (volatility risk premium)
  return Math.max(0.05, hv * 1.3);
}

// True Range ATR-14 from OHLC data — more accurate stop placement than % of move
function calcATR(closes, highs, lows, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i] != null ? highs[i] : closes[i];
    const l = lows[i] != null ? lows[i] : closes[i];
    const pc = closes[i - 1];
    if (h == null || l == null || pc == null) continue;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  const recent = trs.slice(-period);
  return +(recent.reduce((s, x) => s + x, 0) / period).toFixed(4);
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'SPY').toUpperCase();
  const filterExpiry = searchParams.get('expiry') || null;
  const assetclass = ETF_SET.has(symbol) ? 'etf' : 'stocks';

  try {
    const [priceRes, optRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }),
      fetch(`https://api.nasdaq.com/api/quote/${symbol}/option-chain?assetclass=${assetclass}&limit=200&expiryoption=allWeeks&callput=callput`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.nasdaq.com/' }
      }),
    ]);

    const priceData = await priceRes.json();
    const optData = await optRes.json();

    const chartResult = priceData?.chart?.result?.[0];
    const spot = chartResult?.meta?.regularMarketPrice;
    if (!spot) throw new Error('Could not get spot price');

    // Dynamic IV from 30-day historical vol
    const closes = chartResult?.indicators?.quote?.[0]?.close || [];
    const highs  = chartResult?.indicators?.quote?.[0]?.high  || [];
    const lows   = chartResult?.indicators?.quote?.[0]?.low   || [];
    const sigma = calcIV(closes);
    const atr14 = calcATR(closes, highs, lows);

    const rows = optData?.data?.table?.rows || [];
    const availableExpiries = [...new Set(
      rows.filter(r => r.expiryDate && r.expiryDate !== '--').map(r => r.expiryDate)
    )];

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
      // 0DTE gamma is extreme but short-lived — discount contribution to avoid distortion
      const dteWeight = dte < 1 ? 0.25 : dte < 3 ? 0.6 : dte < 7 ? 0.85 : 1.0;
      const gex = (cOI - pOI) * gamma * 100 * spot * dteWeight;

      totalCallVol += cVol;
      totalPutVol += pVol;

      if (!strikeMap[k]) strikeMap[k] = { strike: k, callOI: 0, putOI: 0, callVol: 0, putVol: 0, gex: 0, callGex: 0, putGex: 0, expiryDate: row.expiryDate, dte };
      strikeMap[k].callOI += cOI;
      strikeMap[k].putOI += pOI;
      strikeMap[k].callVol += cVol;
      strikeMap[k].putVol += pVol;
      strikeMap[k].gex += gex;
      strikeMap[k].callGex += cOI * gamma * 100 * spot;
      strikeMap[k].putGex += pOI * gamma * 100 * spot;
    }

    const gexByStrike = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
    if (!gexByStrike.length) throw new Error('No options data available');

    const netGex = gexByStrike.reduce((s, x) => s + x.gex, 0);
    const gammaWall = gexByStrike.reduce((max, x) => x.gex > max.gex ? x : max).strike;
    const putWall = gexByStrike
      .filter(x => x.strike <= spot && x.putOI > 0)
      .reduce((max, x) => x.putOI > max.putOI ? x : max, { putOI: 0, strike: null }).strike;
    const callWall = gexByStrike
      .filter(x => x.strike >= spot && x.callOI > 0)
      .reduce((max, x) => x.callOI > max.callOI ? x : max, { callOI: 0, strike: null }).strike;
    const flipCandidate = gexByStrike.find(x => x.gex > 0 && x.strike >= spot * 0.92);
    const flipLevel = flipCandidate?.strike ?? null;
    const pcVolumeRatio = totalCallVol > 0 ? (totalPutVol / totalCallVol).toFixed(2) : null;

    // Directional king nodes — one buy target (above spot), one sell target (below spot)
    // Score = gamma-weighted OI × log-boosted today's volume (fresh conviction)
    const scoreNode = (x, side) => {
      const gexSide = side === 'buy' ? x.callGex : x.putGex;
      const vol = side === 'buy' ? x.callVol : x.putVol;
      return gexSide * (1 + Math.log1p(vol));
    };
    const buyKingNode = gexByStrike
      .filter(x => x.strike > spot && x.callGex > 0)
      .map(x => ({ ...x, score: scoreNode(x, 'buy') }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
    const sellKingNode = gexByStrike
      .filter(x => x.strike < spot && x.putGex > 0)
      .map(x => ({ ...x, score: scoreNode(x, 'sell') }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
    if (buyKingNode) buyKingNode.distancePct = +((buyKingNode.strike - spot) / spot * 100).toFixed(2);
    if (sellKingNode) sellKingNode.distancePct = +((spot - sellKingNode.strike) / spot * 100).toFixed(2);
    // Normalised bias: +1 fully bullish, -1 fully bearish
    const totalScore = (buyKingNode?.score ?? 0) + (sellKingNode?.score ?? 0);
    const biasScore = totalScore > 0 ? ((buyKingNode?.score ?? 0) - (sellKingNode?.score ?? 0)) / totalScore : 0;

    // Heatmap: per-(strike, expiry) GEX, independent of expiry filter
    const heatRaw = {};
    for (const row of rows) {
      const k = parseFloat(row.strike);
      if (!k || Math.abs(k - spot) / spot > 0.12) continue;
      const exp = row.expiryDate;
      if (!exp || exp === '--') continue;
      const cOI = parseNum(row.c_Openinterest), pOI = parseNum(row.p_Openinterest);
      if (cOI + pOI === 0) continue;
      const dte = parseDTE(exp);
      const heatDteWeight = dte < 1 ? 0.25 : dte < 3 ? 0.6 : dte < 7 ? 0.85 : 1.0;
      const cellGex = (cOI - pOI) * bsGamma(spot, k, dte / 365, sigma) * 100 * spot * heatDteWeight;
      const key = `${k}|${exp}`;
      if (!heatRaw[key]) heatRaw[key] = { strike: k, expiry: exp, callOI: 0, putOI: 0, gex: 0 };
      heatRaw[key].callOI += cOI;
      heatRaw[key].putOI += pOI;
      heatRaw[key].gex += cellGex;
    }
    const heatCells = Object.values(heatRaw);
    // Top 8 expiries by soonest DTE
    const heatExpiries = [...new Set(heatCells.map(c => c.expiry))]
      .sort((a, b) => parseDTE(a) - parseDTE(b))
      .slice(0, 8);
    // Top 28 strikes by total OI across all expiries
    const strikeTotals = {};
    heatCells.forEach(c => { strikeTotals[c.strike] = (strikeTotals[c.strike] || 0) + c.callOI + c.putOI; });
    const heatStrikes = Object.entries(strikeTotals)
      .sort((a, b) => b[1] - a[1]).slice(0, 28)
      .map(([k]) => parseFloat(k)).sort((a, b) => a - b);
    const heatmap = {
      expiries: heatExpiries,
      strikes: heatStrikes,
      cells: heatCells.filter(c => heatExpiries.includes(c.expiry) && heatStrikes.includes(c.strike)),
    };

    return new Response(JSON.stringify({
      symbol, spot, netGex, gammaWall, putWall, callWall, flipLevel,
      totalCallVol, totalPutVol, pcVolumeRatio,
      availableExpiries, impliedVol: parseFloat((sigma * 100).toFixed(1)),
      gexByStrike, buyKingNode, sellKingNode, biasScore, heatmap, atr14,
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
