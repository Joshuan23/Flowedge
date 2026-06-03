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
const IV_MAP = { SPY: 0.14, QQQ: 0.18, NVDA: 0.55, AAPL: 0.27, TSLA: 0.65, META: 0.38, MSFT: 0.24, AMD: 0.55 };
const ASSET_CLASS = { SPY: 'etf', QQQ: 'etf', IWM: 'etf', GLD: 'etf', TLT: 'etf' };
function parseOI(s) { if (!s || s === '--') return 0; return parseInt(String(s).replace(/,/g, '')) || 0; }
function parseDTE(expiryDate) {
  if (!expiryDate || expiryDate === '--') return 7;
  const now = new Date(); const year = now.getFullYear();
  const d = new Date(`${expiryDate} ${year}`);
  if (isNaN(d)) return 7;
  if (d < now) d.setFullYear(year + 1);
  return Math.max(1, Math.ceil((d - now) / 86400000));
}

async function calcGamma(symbol) {
  const assetclass = ASSET_CLASS[symbol] || 'stocks';
  const sigma = IV_MAP[symbol] || 0.30;
  const [priceData, optData] = await Promise.all([
    httpsGet(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`),
    httpsGet(`https://api.nasdaq.com/api/quote/${symbol}/option-chain?assetclass=${assetclass}&limit=200&expiryoption=allWeeks&callput=callput`,
      { 'Accept': 'application/json', 'Referer': 'https://www.nasdaq.com/' }),
  ]);
  const spot = priceData?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!spot) throw new Error('Could not get spot price');
  const rows = optData?.data?.table?.rows || [];
  const strikeMap = {};
  for (const row of rows) {
    const k = parseFloat(row.strike); if (!k) continue;
    if (Math.abs(k - spot) / spot > 0.15) continue;
    const T = parseDTE(row.expiryDate) / 365;
    const gamma = bsGamma(spot, k, T, sigma);
    const cOI = parseOI(row.c_Openinterest), pOI = parseOI(row.p_Openinterest);
    if (!strikeMap[k]) strikeMap[k] = { strike: k, callOI: 0, putOI: 0, gex: 0 };
    strikeMap[k].callOI += cOI; strikeMap[k].putOI += pOI;
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
  return { symbol, spot, netGex, gammaWall, putWall, callWall, flipLevel, gexByStrike };
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
            const symbol = (new URL(req.url, 'http://localhost').searchParams.get('symbol') || 'SPY').toUpperCase();
            const data = await calcGamma(symbol);
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
