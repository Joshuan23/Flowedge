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
//
// UNIVERSE: the full S&P 500 plus the liquid ETF and leveraged/vol complex,
// which is 567 names. Index membership is fetched at runtime so additions and
// deletions arrive on their own, with a baked snapshot as fallback — a source
// outage degrades the universe, it does not break the scan.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// Liquid ETFs and leveraged/vol products — heavily traded options that are not
// in the index, so they are unioned with it rather than replaced by it
const ETFS = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'MDY', 'VOO', 'VTI', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLU',
  'XLP', 'XLB', 'XLRE', 'XLY', 'XLC', 'EEM', 'EFA', 'IEMG', 'KWEB', 'MCHI', 'EWJ', 'EWZ', 'EWY',
  'VEA', 'VWO', 'GLD', 'SLV', 'GDX', 'GDXJ', 'USO', 'UNG', 'TLT', 'HYG', 'LQD', 'IEF', 'SHY',
  'AGG', 'TQQQ', 'SQQQ', 'SPXL', 'SPXU', 'UPRO', 'UVXY', 'VXX', 'SVXY', 'SOXL', 'SOXS', 'LABU',
  'LABD', 'FAS', 'FAZ', 'ARKK', 'ARKG', 'ARKF', 'ARKW', 'ARKQ', 'SMH', 'SOXX', 'IGV', 'CIBR',
  'HACK',
];

// Snapshot of S&P 500 membership, used only when the live fetch fails
const SP500_FALLBACK = [
  'MMM', 'AOS', 'ABT', 'ABBV', 'ACN', 'ADBE', 'AMD', 'AES', 'AFL', 'A', 'APD', 'ABNB', 'AKAM',
  'ALB', 'ARE', 'ALGN', 'ALLE', 'LNT', 'ALL', 'GOOGL', 'GOOG', 'MO', 'AMZN', 'AMCR', 'AEE',
  'AEP', 'AXP', 'AIG', 'AMT', 'AWK', 'AMP', 'AME', 'AMGN', 'APH', 'ADI', 'AON', 'APA', 'APO',
  'AAPL', 'AMAT', 'APP', 'APTV', 'ACGL', 'ADM', 'ARES', 'ANET', 'AJG', 'AIZ', 'T', 'ATO',
  'ADSK', 'ADP', 'AZO', 'AVY', 'AXON', 'BKR', 'BALL', 'BAC', 'BAX', 'BDX', 'BRK.B', 'BBY',
  'TECH', 'BIIB', 'BLK', 'BX', 'XYZ', 'BE', 'BNY', 'BA', 'BKNG', 'BSX', 'BMY', 'AVGO', 'BR',
  'BRO', 'BF.B', 'BG', 'BXP', 'CHRW', 'CDNS', 'CPT', 'COF', 'CAH', 'CCL', 'CARR', 'CVNA',
  'CASY', 'CAT', 'CBOE', 'CBRE', 'CDW', 'COR', 'CNC', 'CNP', 'CF', 'CRL', 'SCHW', 'CHTR', 'CVX',
  'CMG', 'CB', 'CHD', 'CIEN', 'CI', 'CINF', 'CTAS', 'CSCO', 'C', 'CFG', 'CLX', 'CME', 'CMS',
  'KO', 'CTSH', 'COHR', 'COIN', 'CL', 'CMCSA', 'FIX', 'COP', 'ED', 'STZ', 'CEG', 'COO', 'CPRT',
  'GLW', 'CPAY', 'CTVA', 'CSGP', 'COST', 'CRH', 'CRWD', 'CCI', 'CSX', 'CMI', 'CVS', 'DHR',
  'DRI', 'DDOG', 'DVA', 'DECK', 'DE', 'DELL', 'DAL', 'DVN', 'DXCM', 'FANG', 'DLR', 'DG', 'DLTR',
  'D', 'DPZ', 'DASH', 'DOV', 'DOW', 'DHI', 'DTE', 'DUK', 'DD', 'ETN', 'EBAY', 'ECHO', 'ECL',
  'EIX', 'EW', 'ELV', 'EME', 'EMR', 'ETR', 'EOG', 'EQT', 'EFX', 'EQIX', 'ERIE', 'ESS', 'EL',
  'EG', 'EVRG', 'P', 'ES', 'EXC', 'EXE', 'EXPE', 'EXPD', 'EXR', 'XOM', 'FFIV', 'FDS', 'FICO',
  'FAST', 'FRT', 'FDX', 'FDXF', 'FERG', 'FIS', 'FITB', 'FSLR', 'FE', 'FISV', 'FLEX', 'F',
  'FTNT', 'FTV', 'FOXA', 'FOX', 'BEN', 'FCX', 'GRMN', 'IT', 'GE', 'GEHC', 'GEV', 'GEN', 'GNRC',
  'GD', 'GIS', 'GM', 'GPC', 'GILD', 'GPN', 'GL', 'GDDY', 'GS', 'HAL', 'HIG', 'HAS', 'HCA',
  'DOC', 'HSIC', 'HSY', 'HPE', 'HLT', 'HD', 'HONA', 'HON', 'HRL', 'HST', 'HWM', 'HPQ', 'HUBB',
  'HUM', 'HBAN', 'HII', 'IBM', 'IEX', 'IDXX', 'ITW', 'ILMN', 'INCY', 'IR', 'PODD', 'INTC',
  'IBKR', 'ICE', 'IFF', 'IP', 'INTU', 'ISRG', 'IVZ', 'INVH', 'IQV', 'IRM', 'JBHT', 'JBL',
  'JKHY', 'J', 'JNJ', 'JCI', 'JPM', 'KVUE', 'KDP', 'KEY', 'KEYS', 'KMB', 'KIM', 'KMI', 'KKR',
  'KLAC', 'KHC', 'KR', 'LHX', 'LH', 'LRCX', 'LVS', 'LDOS', 'LEN', 'LII', 'LLY', 'LIN', 'LYV',
  'LMT', 'L', 'LOW', 'LULU', 'LITE', 'LYB', 'MTB', 'MPC', 'MAR', 'MRSH', 'MLM', 'MRVL', 'MAS',
  'MA', 'MKC', 'MCD', 'MCK', 'MDT', 'MRK', 'META', 'MET', 'MTD', 'MGM', 'MCHP', 'MU', 'MSFT',
  'MAA', 'MRNA', 'MDLZ', 'MPWR', 'MNST', 'MCO', 'MS', 'MOS', 'MSI', 'MSCI', 'NDAQ', 'NTAP',
  'NFLX', 'NEM', 'NWSA', 'NWS', 'NEE', 'NKE', 'NI', 'NDSN', 'NSC', 'NTRS', 'NOC', 'NCLH', 'NRG',
  'NUE', 'NVDA', 'NVR', 'NXPI', 'ORLY', 'OXY', 'ODFL', 'OMC', 'ON', 'OKE', 'ORCL', 'OTIS',
  'PCAR', 'PKG', 'PLTR', 'PANW', 'PSKY', 'PH', 'PAYX', 'PYPL', 'PNR', 'PEP', 'PFE', 'PCG', 'PM',
  'PSX', 'PNW', 'PNC', 'PPG', 'PPL', 'PFG', 'PG', 'PGR', 'PLD', 'PRU', 'PEG', 'PTC', 'PSA',
  'PHM', 'PWR', 'QCOM', 'DGX', 'Q', 'RL', 'RJF', 'RDDT', 'RTX', 'O', 'REG', 'REGN', 'RF', 'RSG',
  'RMD', 'RVTY', 'HOOD', 'ROK', 'ROL', 'ROP', 'ROST', 'RCL', 'SPGI', 'CRM', 'SNDK', 'SBAC',
  'SLB', 'STX', 'SRE', 'NOW', 'SHW', 'SPG', 'SWKS', 'SJM', 'SW', 'SNA', 'SOLV', 'SO', 'LUV',
  'SWK', 'SBUX', 'STT', 'STLD', 'STE', 'SYK', 'SMCI', 'SYF', 'SNPS', 'SYY', 'TMUS', 'TROW',
  'TTWO', 'TPR', 'TRGP', 'TGT', 'TEL', 'TDY', 'TER', 'TSLA', 'TXN', 'TPL', 'TXT', 'TMO', 'TJX',
  'TKO', 'TSCO', 'TT', 'TDG', 'TRV', 'TRMB', 'TFC', 'TYL', 'TSN', 'USB', 'UBER', 'UDR', 'ULTA',
  'UNP', 'UAL', 'UPS', 'URI', 'UNH', 'UHS', 'VLO', 'VEEV', 'VTR', 'VLTO', 'VRSN', 'VRSK', 'VZ',
  'VRTX', 'VRT', 'VTRS', 'VICI', 'V', 'VST', 'VMRK', 'VMC', 'WRB', 'GWW', 'WAB', 'WMT', 'DIS',
  'WBD', 'WM', 'WAT', 'WEC', 'WFC', 'WELL', 'WST', 'WDC', 'WY', 'WSM', 'WMB', 'WTW', 'WDAY',
  'WYNN', 'XEL', 'XYL', 'YUM', 'ZBRA', 'ZBH', 'ZTS',
];

const SP500_CSV = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv';

async function sp500Constituents() {
  try {
    const r = await fetch(SP500_CSV, { headers: { 'User-Agent': UA } });
    if (!r.ok) return { list: SP500_FALLBACK, live: false };
    const rows = (await r.text()).trim().split('\n').slice(1);
    const list = rows.map(x => x.split(',')[0].trim()).filter(x => /^[A-Z.]{1,6}$/.test(x));
    // A truncated or malformed file should not silently shrink the universe
    return list.length > 400 ? { list, live: true } : { list: SP500_FALLBACK, live: false };
  } catch { return { list: SP500_FALLBACK, live: false }; }
}

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
  // Liquidity floors, because a setup you cannot fill is not a setup
  const minPrice = Number(url.searchParams.get('minPrice')) || 3;
  const minAvgVol = Number(url.searchParams.get('minAvgVol')) || 500000;

  try {
    const t0 = Date.now();
    const sp = override ? null : await sp500Constituents();
    const symbols = override
      ? override.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      : [...new Set([...sp.list, ...ETFS])].sort();

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
      universe: override ? 'custom' : `S&P 500 (${sp.live ? 'live membership' : 'cached snapshot'}) + ${ETFS.length} ETFs`,
      sp500Live: override ? null : sp.live,
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
