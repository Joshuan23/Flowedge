import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FIELDS = 'regularMarketPrice,regularMarketChangePercent,regularMarketVolume,regularMarketDayHigh,regularMarketDayLow,marketCap,fiftyTwoWeekHigh,shortName';

let yfCache = null;

async function getYFAuth() {
  if (yfCache && Date.now() - yfCache.ts < 3_600_000) return yfCache;

  const init = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  const setCookies = init.headers.getSetCookie?.() ?? [];
  const cookies = setCookies.map(c => c.split(';')[0]).join('; ');

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookies },
  });
  const crumb = await crumbRes.text();

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
            const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&crumb=${encodeURIComponent(crumb)}&fields=${FIELDS}`;
            const yfRes = await fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookies } });
            const data = await yfRes.json();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      },
    },
  ],
})
