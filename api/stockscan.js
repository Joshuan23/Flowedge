export const config = { runtime: 'edge' };

// Whole-universe stock scan — stage one of two.
//
// WHY TWO STAGES: a full stock setup needs an options chain per symbol, and
// /api/gamma measures at roughly 3 seconds a name. Across 217 tickers that is
// over ten minutes, which fits in no request. What IS cheap is Yahoo's batch
// quote: measured at 60 symbols in 161ms, so the entire universe costs about a
// second in four batches.
//
// So this endpoint answers "which names are worth spending a chain request on"
// and the client deep-scans the top of that list through /api/stocksignal,
// where the browser has no single-request timeout and results stream in.
//
// RANKED BY RELATIVE VOLUME, NOT BY A DIRECTIONAL GUESS. Deliberately: the
// factors that decide direction (dealer gamma, options flow, dark pool) all
// live in stage two, so guessing direction here from price alone would bury
// exactly the names whose signal has not been fetched yet. Relative volume is
// the honest stage-one question — where is something actually happening.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// Mirrors TICKER_GROUPS in the app so the scanner and the pickers agree
const UNIVERSE = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'MDY', 'VOO', 'VTI', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLU',
  'XLP', 'XLB', 'XLRE', 'XLY', 'XLC', 'EEM', 'EFA', 'IEMG', 'KWEB', 'MCHI', 'EWJ', 'EWZ', 'EWY',
  'VEA', 'VWO', 'GLD', 'SLV', 'GDX', 'GDXJ', 'USO', 'UNG', 'TLT', 'HYG', 'LQD', 'IEF', 'SHY',
  'AGG', 'TQQQ', 'SQQQ', 'SPXL', 'SPXU', 'UPRO', 'UVXY', 'VXX', 'SVXY', 'SOXL', 'SOXS', 'LABU',
  'LABD', 'FAS', 'FAZ', 'ARKK', 'ARKG', 'ARKF', 'ARKW', 'ARKQ', 'SMH', 'SOXX', 'IGV', 'CIBR',
  'HACK', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'ORCL',
  'AMD', 'INTC', 'QCOM', 'MU', 'AMAT', 'LRCX', 'KLAC', 'MRVL', 'SMCI', 'ARM', 'TXN', 'NXPI',
  'ADI', 'MCHP', 'ON', 'MPWR', 'CRM', 'ADBE', 'NOW', 'WDAY', 'INTU', 'PLTR', 'AI', 'NET',
  'SNOW', 'DDOG', 'CRWD', 'ZS', 'PANW', 'OKTA', 'FTNT', 'MDB', 'COIN', 'MSTR', 'HOOD', 'RIOT',
  'MARA', 'CLSK', 'SOFI', 'UPST', 'AFRM', 'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA',
  'AXP', 'BLK', 'COF', 'SCHW', 'BX', 'KKR', 'UNH', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO',
  'DHR', 'AMGN', 'GILD', 'ISRG', 'VRTX', 'REGN', 'MRNA', 'HD', 'MCD', 'NKE', 'SBUX', 'WMT',
  'COST', 'DIS', 'NFLX', 'BKNG', 'ABNB', 'UBER', 'LYFT', 'DASH', 'GM', 'F', 'RIVN', 'XOM',
  'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'VLO', 'PSX', 'HAL', 'DVN', 'LNG', 'MPC', 'BA', 'CAT',
  'GE', 'HON', 'RTX', 'LMT', 'NOC', 'GD', 'UNP', 'CSX', 'FDX', 'UPS', 'DE', 'MMM', 'ETN', 'T',
  'VZ', 'TMUS', 'CMCSA', 'SNAP', 'PINS', 'RDDT', 'MTCH', 'PARA', 'AMT', 'PLD', 'EQIX', 'SPG',
  'O', 'PSA', 'DLR', 'WELL', 'CCI', 'VICI', 'FCX', 'NEM', 'GOLD', 'AA', 'CLF', 'STLD', 'NUE',
  'LIN', 'APD', 'ECL', 'ALB', 'SQM',
];

const FIELDS = [
  'symbol', 'shortName', 'regularMarketPrice', 'regularMarketChangePercent',
  'regularMarketVolume', 'regularMarketDayHigh', 'regularMarketDayLow',
  'regularMarketPreviousClose', 'fiftyTwoWeekHigh', 'fiftyTwoWeekLow',
  'averageDailyVolume3Month', 'marketCap', 'marketState',
].join(',');

// Yahoo gates the quote endpoint behind a cookie + crumb pair
async function getCrumb() {
  const seed = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const setCookie = seed.headers.get('set-cookie') || '';
  const cookie = setCookie.split(',').map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
  const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
  });
  return { cookie, crumb: (await res.text()).trim() };
}

export default async function handler(req) {
  const url = new URL(req.url);
  const override = url.searchParams.get('symbols');
  const symbols = override
    ? override.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : UNIVERSE;
  // Liquidity floors, because a setup you cannot fill is not a setup
  const minPrice = Number(url.searchParams.get('minPrice')) || 3;
  const minAvgVol = Number(url.searchParams.get('minAvgVol')) || 500000;

  try {
    const t0 = Date.now();
    const { cookie, crumb } = await getCrumb();
    if (!crumb) return json({ error: 'Could not obtain Yahoo crumb' }, 502);
    const headers = { 'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json' };

    // 60 per batch, measured comfortably within limits
    const BATCH = 60;
    const batches = [];
    for (let i = 0; i < symbols.length; i += BATCH) batches.push(symbols.slice(i, i + BATCH));
    const results = (await Promise.all(batches.map(async b => {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${b.join(',')}&fields=${FIELDS}&crumb=${encodeURIComponent(crumb)}`,
        { headers });
      if (!r.ok) return [];
      return (await r.json())?.quoteResponse?.result || [];
    }))).flat();

    const marketState = results[0]?.marketState || null;
    const rows = [];
    for (const q of results) {
      const price = Number(q.regularMarketPrice) || 0;
      const avgVol = Number(q.averageDailyVolume3Month) || 0;
      if (price < minPrice || avgVol < minAvgVol) continue;
      const vol = Number(q.regularMarketVolume) || 0;
      const hi = Number(q.regularMarketDayHigh) || 0;
      const lo = Number(q.regularMarketDayLow) || 0;
      const wHi = Number(q.fiftyTwoWeekHigh) || 0;
      const wLo = Number(q.fiftyTwoWeekLow) || 0;
      rows.push({
        symbol: q.symbol,
        name: q.shortName || q.symbol,
        price,
        changePct: Number(q.regularMarketChangePercent) ?? null,
        volume: vol,
        avgVolume: avgVol,
        // Above 1 means today is busier than a typical day — the classic
        // "something is happening here" screen
        relVolume: avgVol > 0 ? +(vol / avgVol).toFixed(2) : null,
        dollarVolume: Math.round(price * vol),
        dayRangePos: hi > lo ? +((price - lo) / (hi - lo) * 100).toFixed(0) : null,
        yearRangePos: wHi > wLo ? +((price - wLo) / (wHi - wLo) * 100).toFixed(0) : null,
        marketCap: Number(q.marketCap) || null,
      });
    }

    rows.sort((a, b) => (b.relVolume ?? 0) - (a.relVolume ?? 0));

    return json({
      scanned: symbols.length,
      returned: results.length,
      liquid: rows.length,
      marketState,
      filters: { minPrice, minAvgVol },
      candidates: rows,
      elapsedMs: Date.now() - t0,
      note: 'Stage one: liquidity and activity only. Nothing here is directional — dealer gamma, options flow and dark pool levels all come from the per-symbol deep scan.',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
