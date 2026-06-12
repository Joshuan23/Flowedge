export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });

    if (!res.ok) throw new Error(`Hyperliquid upstream error ${res.status}`);
    const raw = await res.json();

    // Response shape: [meta, assetCtxs]
    const [meta, ctxs] = raw;

    const assets = meta.universe.map((asset, i) => {
      const ctx = ctxs[i] || {};
      const markPx  = parseFloat(ctx.markPx  || ctx.midPx || 0);
      const prevPx  = parseFloat(ctx.prevDayPx || markPx);
      const funding = parseFloat(ctx.funding  || 0);     // per 8-hour period (decimal)
      const oi      = parseFloat(ctx.openInterest || 0); // in coin units
      const oiUsd   = oi * markPx;
      return {
        name:        asset.name,
        markPx,
        prevDayPx:   prevPx,
        changePct:   prevPx ? ((markPx - prevPx) / prevPx) * 100 : 0,
        funding,                             // 8h decimal, e.g. 0.0001 = 0.01%
        fundingAnn:  funding * 3 * 365 * 100, // annualised %
        openInterest: oi,
        oiUsd,
        dayVolume:   parseFloat(ctx.dayNtlVlm || 0),
      };
    }).filter(a => a.markPx > 0);

    return new Response(JSON.stringify({ assets }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=30, stale-while-revalidate=10',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
