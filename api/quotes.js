import https from 'https';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { maxHeaderSize: 65536, headers: { 'User-Agent': UA } }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta) return reject(new Error(`No data for ${symbol}`));
          const prev = meta.chartPreviousClose || meta.regularMarketPrice;
          resolve({
            symbol: meta.symbol,
            shortName: meta.shortName || meta.longName || symbol,
            regularMarketPrice: meta.regularMarketPrice,
            regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
            regularMarketVolume: meta.regularMarketVolume,
            regularMarketDayHigh: meta.regularMarketDayHigh,
            regularMarketDayLow: meta.regularMarketDayLow,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            marketCap: null,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error(`timeout: ${symbol}`)); });
  });
}

export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  try {
    const tickers = symbols.split(',').map(s => s.trim()).filter(Boolean);
    const results = await Promise.all(tickers.map(fetchChart));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ quoteResponse: { result: results, error: null } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
