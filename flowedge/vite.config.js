import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'

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

let yfCache = null;

async function getYFAuth() {
  if (yfCache && Date.now() - yfCache.ts < 3_600_000) return yfCache;

  const init = await get('https://finance.yahoo.com/', { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' });
  const setCookies = [].concat(init.headers['set-cookie'] || []);
  const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

  const crumbRes = await get('https://query1.finance.yahoo.com/v1/test/getcrumb', { Cookie: cookies });
  const crumb = crumbRes.body.trim();

  yfCache = { cookies, crumb, ts: Date.now() };
  return yfCache;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-quotes-dev',
      configureServer(server) {
        server.middlewares.use('/api/quotes', async (req, res) => {
          try {
            const symbols = new URL(req.url, 'http://localhost').searchParams.get('symbols') || '';
            const { cookies, crumb } = await getYFAuth();
            const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&crumb=${encodeURIComponent(crumb)}&fields=${FIELDS}`;
            const r = await get(url, { Cookie: cookies });
            res.setHeader('Content-Type', 'application/json');
            res.end(r.body);
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      },
    },
  ],
})
