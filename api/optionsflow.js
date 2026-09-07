export const config = { runtime: 'edge' };

// Options activity from the NASDAQ chain.
//
// HONEST SCOPE: this is not tick-level flow. True "flow" products (Unusual
// Whales, Cheddar Flow) read the options tape trade by trade and classify each
// print as a sweep/block and at-bid/at-ask, which needs a paid OPRA feed. What
// is free is the chain snapshot: volume and open interest per contract.
//
// That still surfaces the thing most flow screens are actually used for —
// contracts trading far above their existing open interest, which means
// today's activity is NEW positioning rather than shuffling old inventory.
// A vol/OI above ~1 is the classic unusual-activity screen.

const ETF_SET = new Set(['SPY','QQQ','IWM','DIA','GLD','SLV','TLT','XLF','XLE','XLK','HYG','EEM','ARKK','SMH','USO']);
const num = s => {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/[,$]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default async function handler(req) {
  const url    = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || 'SPY').toUpperCase();
  const assetclass = ETF_SET.has(symbol) ? 'etf' : 'stocks';

  try {
    const [optRes, spotRes] = await Promise.all([
      fetch(`https://api.nasdaq.com/api/quote/${symbol}/option-chain?assetclass=${assetclass}&limit=800&expiryoption=allWeeks&callput=callput`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.nasdaq.com/' },
      }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    ]);

    if (!optRes.ok) return json({ error: `NASDAQ HTTP ${optRes.status}`, symbol, flows: [] }, optRes.status);
    const optData = await optRes.json();
    const spotData = spotRes.ok ? await spotRes.json() : null;
    const spot = spotData?.chart?.result?.[0]?.meta?.regularMarketPrice || null;

    const rows = optData?.data?.table?.rows || [];
    const flows = [];
    let callVol = 0, putVol = 0, callOI = 0, putOI = 0, callNotional = 0, putNotional = 0;

    for (const r of rows) {
      // The chain interleaves group-header rows (expirygroup set, data null)
      const strike = num(r.strike);
      if (!strike) continue;
      const expiry = r.expiryDate || '';

      for (const side of ['c', 'p']) {
        const vol = num(r[`${side}_Volume`]);
        const oi  = num(r[`${side}_Openinterest`]);
        const bid = num(r[`${side}_Bid`]);
        const ask = num(r[`${side}_Ask`]);
        const last = num(r[`${side}_Last`]);
        if (side === 'c') { callVol += vol; callOI += oi; } else { putVol += vol; putOI += oi; }
        if (vol <= 0) continue;

        // Mid is the fairest premium estimate; fall back to last when the
        // quote is missing, which is common on illiquid strikes
        const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
        const notional = vol * mid * 100; // 100 shares per contract
        if (side === 'c') callNotional += notional; else putNotional += notional;

        const volOI = oi > 0 ? vol / oi : (vol > 0 ? Infinity : 0);
        flows.push({
          type: side === 'c' ? 'CALL' : 'PUT',
          strike, expiry, volume: vol, oi,
          volOI: Number.isFinite(volOI) ? +volOI.toFixed(2) : null,
          newPositioning: oi === 0 || volOI >= 1,   // today's volume exceeds all standing OI
          premium: +mid.toFixed(2),
          notional: Math.round(notional),
          moneyness: spot ? +((strike - spot) / spot * 100).toFixed(2) : null,
        });
      }
    }

    // Rank by notional — dollars committed is the signal, not contract count
    flows.sort((a, b) => b.notional - a.notional);
    const top = flows.slice(0, 40);
    const unusual = flows.filter(f => f.newPositioning && f.notional > 25000).slice(0, 25);

    return json({
      symbol, spot,
      flows: top,
      unusual,
      totals: {
        callVol, putVol, callOI, putOI,
        callNotional: Math.round(callNotional),
        putNotional: Math.round(putNotional),
        pcVolume: callVol > 0 ? +(putVol / callVol).toFixed(2) : null,
        pcOI: callOI > 0 ? +(putOI / callOI).toFixed(2) : null,
        // Share of premium going to calls — the cleaner directional read,
        // since one deep ITM call can outweigh hundreds of cheap ones
        callPremiumShare: callNotional + putNotional > 0
          ? +(callNotional / (callNotional + putNotional) * 100).toFixed(1) : null,
      },
      contractsScanned: flows.length,
      source: 'NASDAQ option chain snapshot — volume vs open interest, not tick-level tape',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message, symbol, flows: [] }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=30',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
