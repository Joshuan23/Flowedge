export const config = { runtime: 'edge' };

// Yahoo has no spot XAU/XAG symbols. For metals we fetch the futures candles
// (same shape as spot) and re-anchor every OHLC value to the live spot price
// from gold-api.com, so levels match TradingView's OANDA spot quotes.
const METAL_SPOT = {
  XAUUSD: { proxy: 'GC=F', api: 'XAU' },
  XAGUSD: { proxy: 'SI=F', api: 'XAG' },
};

export default async function handler(req) {
  const url = new URL(req.url);
  const symbol   = url.searchParams.get('symbol')   || 'EURUSD=X';
  const interval = url.searchParams.get('interval') || '1d';
  const range    = url.searchParams.get('range')    || '90d';
  const metal    = METAL_SPOT[symbol.toUpperCase()];
  const ySymbol  = metal ? metal.proxy : symbol;

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${interval}&range=${range}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }
    );

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Yahoo HTTP ${res.status}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data   = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      return new Response(JSON.stringify({ error: 'No data returned' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const timestamps = result.timestamp || [];
    const quote      = result.indicators?.quote?.[0] || {};

    const candles = timestamps
      .map((t, i) => ({
        time:   t,
        open:   quote.open?.[i],
        high:   quote.high?.[i],
        low:    quote.low?.[i],
        close:  quote.close?.[i],
        volume: quote.volume?.[i] ?? 0,
      }))
      .filter(c => c.open != null && c.high != null && c.low != null && c.close != null);

    const meta = {
      symbol:              metal ? symbol : result.meta?.symbol,
      currency:            result.meta?.currency,
      regularMarketPrice:  result.meta?.regularMarketPrice,
    };

    // Re-anchor futures candles onto the live spot price
    if (metal && candles.length) {
      try {
        const sres = await fetch(`https://api.gold-api.com/price/${metal.api}`, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        });
        const spot = (await sres.json())?.price;
        const ref  = meta.regularMarketPrice || candles[candles.length - 1].close;
        if (spot > 0 && ref > 0) {
          const k = spot / ref;
          for (const c of candles) { c.open *= k; c.high *= k; c.low *= k; c.close *= k; }
          meta.regularMarketPrice = spot;
          meta.spotAnchored = true;
        }
      } catch {}
    }

    const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '90m'].includes(interval);
    return new Response(JSON.stringify({ candles, meta }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': isIntraday ? 's-maxage=30, stale-while-revalidate=15' : 's-maxage=300, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
