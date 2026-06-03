import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { maxHeaderSize: 65536, headers: { 'User-Agent': UA, ...extraHeaders } }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchChart(symbol) {
  return httpsGet(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`)
    .then(data => {
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) throw new Error('No data for ' + symbol);
      const prev = meta.chartPreviousClose || meta.regularMarketPrice;
      return {
        symbol: meta.symbol, shortName: meta.shortName || meta.longName || symbol,
        regularMarketPrice: meta.regularMarketPrice,
        regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
        regularMarketVolume: meta.regularMarketVolume,
        regularMarketDayHigh: meta.regularMarketDayHigh,
        regularMarketDayLow: meta.regularMarketDayLow,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        marketCap: null,
      };
    });
}

// --- Gamma calculation (mirrors api/gamma.js) ---
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
function parseOI(s) { if (!s || s === '--') return 0; return parseInt(String(s).replace(/,/g, '')) || 0; }
function parseDTE(expiryDate) {
  if (!expiryDate || expiryDate === '--') return 7;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(`${expiryDate} ${now.getFullYear()}`);
  if (isNaN(d)) return 7;
  const expMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (expMidnight < todayMidnight) expMidnight.setFullYear(now.getFullYear() + 1);
  return Math.max(0.5, (expMidnight - todayMidnight) / 86400000);
}
function calcIV(closes) {
  const valid = (closes || []).filter(Boolean);
  if (valid.length < 5) return 0.20;
  const logRets = valid.slice(1).map((c, i) => Math.log(c / valid[i]));
  const mean = logRets.reduce((s, x) => s + x, 0) / logRets.length;
  const variance = logRets.reduce((s, x) => s + (x - mean) ** 2, 0) / logRets.length;
  return Math.max(0.05, Math.sqrt(variance * 252) * 1.3);
}

async function calcGamma(symbol, filterExpiry) {
  const assetclass = ETF_SET.has(symbol) ? 'etf' : 'stocks';
  const [priceData, optData] = await Promise.all([
    httpsGet(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`),
    httpsGet(`https://api.nasdaq.com/api/quote/${symbol}/option-chain?assetclass=${assetclass}&limit=200&expiryoption=allWeeks&callput=callput`,
      { 'Accept': 'application/json', 'Referer': 'https://www.nasdaq.com/' }),
  ]);
  const chartResult = priceData?.chart?.result?.[0];
  const spot = chartResult?.meta?.regularMarketPrice;
  if (!spot) throw new Error('Could not get spot price');
  const sigma = calcIV(chartResult?.indicators?.quote?.[0]?.close);
  const rows = optData?.data?.table?.rows || [];
  const availableExpiries = [...new Set(rows.filter(r => r.expiryDate && r.expiryDate !== '--').map(r => r.expiryDate))];
  const strikeMap = {};
  let totalCallVol = 0, totalPutVol = 0;
  for (const row of rows) {
    const k = parseFloat(row.strike); if (!k) continue;
    if (Math.abs(k - spot) / spot > 0.15) continue;
    if (filterExpiry && row.expiryDate !== filterExpiry) continue;
    const dte = parseDTE(row.expiryDate);
    const T = dte / 365;
    const gamma = bsGamma(spot, k, T, sigma);
    const cOI = parseOI(row.c_Openinterest), pOI = parseOI(row.p_Openinterest);
    const cVol = parseOI(row.c_Volume), pVol = parseOI(row.p_Volume);
    totalCallVol += cVol; totalPutVol += pVol;
    if (!strikeMap[k]) strikeMap[k] = { strike: k, callOI: 0, putOI: 0, callVol: 0, putVol: 0, gex: 0, expiryDate: row.expiryDate, dte };
    strikeMap[k].callOI += cOI; strikeMap[k].putOI += pOI;
    strikeMap[k].callVol += cVol; strikeMap[k].putVol += pVol;
    strikeMap[k].gex += (cOI - pOI) * gamma * 100 * spot;
  }
  const gexByStrike = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
  if (!gexByStrike.length) throw new Error('No options data');
  const netGex = gexByStrike.reduce((s, x) => s + x.gex, 0);
  const gammaWall = gexByStrike.reduce((max, x) => x.gex > max.gex ? x : max).strike;
  const putWall = gexByStrike.filter(x => x.strike <= spot && x.putOI > 0)
    .reduce((max, x) => x.putOI > max.putOI ? x : max, { putOI: 0, strike: null }).strike;
  const callWall = gexByStrike.filter(x => x.strike >= spot && x.callOI > 0)
    .reduce((max, x) => x.callOI > max.callOI ? x : max, { callOI: 0, strike: null }).strike;
  const flipCandidate = gexByStrike.find(x => x.gex > 0 && x.strike >= spot * 0.92);
  const flipLevel = flipCandidate?.strike ?? null;
  const pcVolumeRatio = totalCallVol > 0 ? (totalPutVol / totalCallVol).toFixed(2) : null;
  const kingNodes = [...gexByStrike]
    .filter(x => x.callOI > 0 && x.putOI > 0)
    .map(x => ({ strike: x.strike, balancedOI: Math.min(x.callOI, x.putOI), callOI: x.callOI, putOI: x.putOI }))
    .sort((a, b) => b.balancedOI - a.balancedOI)
    .slice(0, 5);
  // Heatmap
  const heatRaw = {};
  for (const row of rows) {
    const k = parseFloat(row.strike);
    if (!k || Math.abs(k - spot) / spot > 0.12) continue;
    const exp = row.expiryDate;
    if (!exp || exp === '--') continue;
    const cOI = parseOI(row.c_Openinterest), pOI = parseOI(row.p_Openinterest);
    if (cOI + pOI === 0) continue;
    const dte = parseDTE(exp);
    const cellGex = (cOI - pOI) * bsGamma(spot, k, dte / 365, sigma) * 100 * spot;
    const key = `${k}|${exp}`;
    if (!heatRaw[key]) heatRaw[key] = { strike: k, expiry: exp, callOI: 0, putOI: 0, gex: 0 };
    heatRaw[key].callOI += cOI;
    heatRaw[key].putOI += pOI;
    heatRaw[key].gex += cellGex;
  }
  const heatCells = Object.values(heatRaw);
  const heatExpiries = [...new Set(heatCells.map(c => c.expiry))]
    .sort((a, b) => parseDTE(a) - parseDTE(b)).slice(0, 8);
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
  return { symbol, spot, netGex, gammaWall, putWall, callWall, flipLevel, totalCallVol, totalPutVol, pcVolumeRatio, availableExpiries, impliedVol: parseFloat((sigma * 100).toFixed(1)), gexByStrike, kingNodes, heatmap };
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-dev',
      configureServer(server) {
        server.middlewares.use('/api/quotes', async (req, res) => {
          try {
            const symbols = new URL(req.url, 'http://localhost').searchParams.get('symbols') || '';
            const results = await Promise.all(symbols.split(',').map(s => s.trim()).filter(Boolean).map(fetchChart));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ quoteResponse: { result: results, error: null } }));
          } catch (e) {
            res.statusCode = 500; res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use('/api/gamma', async (req, res) => {
          try {
            const sp = new URL(req.url, 'http://localhost').searchParams;
            const symbol = (sp.get('symbol') || 'SPY').toUpperCase();
            const filterExpiry = sp.get('expiry') || null;
            const data = await calcGamma(symbol, filterExpiry);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch (e) {
            res.statusCode = 500; res.end(JSON.stringify({ error: e.message }));
          }
        });
      },
    },
  ],
})
