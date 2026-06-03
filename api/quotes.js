const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No data for ${symbol}`);
  const prev = meta.chartPreviousClose || meta.regularMarketPrice;
  return {
    symbol: meta.symbol,
    shortName: meta.shortName || meta.longName || symbol,
    regularMarketPrice: meta.regularMarketPrice,
    regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
    regularMarketVolume: meta.regularMarketVolume,
    regularMarketDayHigh: meta.regularMarketDayHigh,
    regularMarketDayLow: meta.regularMarketDayLow,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    marketCap: null,
  };
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get('symbols');
  if (!symbols) return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400 });

  try {
    const tickers = symbols.split(',').map(s => s.trim()).filter(Boolean);
    const results = await Promise.all(tickers.map(fetchChart));
    return new Response(
      JSON.stringify({ quoteResponse: { result: results, error: null } }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export const config = { runtime: 'edge' };
