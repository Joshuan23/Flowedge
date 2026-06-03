import https from 'https';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FIELDS = 'regularMarketPrice,regularMarketChangePercent,regularMarketVolume,regularMarketDayHigh,regularMarketDayLow,marketCap,fiftyTwoWeekHigh,shortName';
const AGENT = new https.Agent({ keepAlive: true });

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: AGENT, maxHeaderSize: 65536, headers: { 'User-Agent': UA, ...headers } }, (res) => {
      const raw = [];
      res.on('data', chunk => raw.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(raw).toString() }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

let cache = null;

async function getAuth() {
  if (cache && Date.now() - cache.ts < 3_600_000) return cache;

  const init = await get('https://finance.yahoo.com/', { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' });
  const setCookies = [].concat(init.headers['set-cookie'] || []);
  const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

  const crumbRes = await get('https://query1.finance.yahoo.com/v1/test/getcrumb', { Cookie: cookies });
  const crumb = crumbRes.body.trim();

  cache = { cookies, crumb, ts: Date.now() };
  return cache;
}

export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  try {
    const { cookies, crumb } = await getAuth();
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&crumb=${encodeURIComponent(crumb)}&fields=${FIELDS}`;
    const r = await get(url, { Cookie: cookies });
    const data = JSON.parse(r.body);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
