const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FIELDS = [
  'symbol','shortName','longName',
  'regularMarketPrice','regularMarketChange','regularMarketChangePercent',
  'regularMarketVolume','regularMarketDayHigh','regularMarketDayLow',
  'regularMarketPreviousClose',
  'fiftyTwoWeekHigh','fiftyTwoWeekLow',
  'marketCap','earningsTimestamp','earningsTimestampStart','earningsTimestampEnd',
  'averageDailyVolume3Month','averageDailyVolume10Day',
  'trailingPE','forwardPE',
].join(',');

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get('symbols');
  if (!symbols) return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400 });

  try {
    const tickers = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    // v7 batch quote — returns marketCap, earnings dates, average volume in one request
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(',')}&fields=${FIELDS}&formatted=false&lang=en-US&region=US`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    const data = await res.json();
    let results = data?.quoteResponse?.result || [];

    // Fallback: if v7 returns nothing, use chart endpoint per-symbol
    if (!results.length) {
      results = await Promise.all(tickers.map(async sym => {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`, {
          headers: { 'User-Agent': UA },
        });
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (!meta) return null;
        const prev = meta.chartPreviousClose || meta.regularMarketPrice;
        return {
          symbol: meta.symbol,
          shortName: meta.shortName || meta.longName || sym,
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
          regularMarketVolume: meta.regularMarketVolume,
          regularMarketDayHigh: meta.regularMarketDayHigh,
          regularMarketDayLow: meta.regularMarketDayLow,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          marketCap: null,
        };
      }));
      results = results.filter(Boolean);
    }

    return new Response(
      JSON.stringify({ quoteResponse: { result: results, error: null } }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export const config = { runtime: 'edge' };
