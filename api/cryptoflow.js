export const config = { runtime: 'edge' };

// Crypto money-flow — the honest analog to the Dark Pool tab.
//
// WHY THIS IS NOT A DARK POOL TAB: the equity Dark Pool tab works because FINRA
// legally compels ATS venues to report off-exchange volume. Crypto has no such
// regime. OTC desks (Cumberland, B2C2, Genesis) report nothing, ever, and
// anything sold as a "crypto dark pool feed" is estimating or reselling. So
// this tab does not pretend to show hidden volume.
//
// What it shows instead is two things equities cannot offer at any price:
//
//   1. WALLET ATTRIBUTION. Hyperliquid publishes the counterparty addresses on
//      every print. You can see which wallets are trading, not just that volume
//      occurred. No equity feed gives you that.
//
//   2. POSITIONING EXTREMES. Open interest and funding across every listed
//      perp. Funding is the cleanest crowding signal in crypto: strongly
//      positive means longs are paying shorts to hold the trade, which is what
//      a crowded long looks like before it unwinds.
//
// SCOPE LIMIT, MEASURED NOT ASSUMED: recentTrades returns only ~10 prints
// covering a few SECONDS. A single snapshot shows almost nothing, so the client
// polls and accumulates with tid dedup. The trade view therefore builds up from
// when the tab was opened — it is not history, and the UI says so.

const HL = 'https://api.hyperliquid.xyz/info';
const post = body => fetch(HL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export default async function handler(req) {
  const url  = new URL(req.url);
  const coin = url.searchParams.get('coin') || 'BTC';

  try {
    const [ctxRes, tradesRes] = await Promise.all([
      post({ type: 'metaAndAssetCtxs' }),
      post({ type: 'recentTrades', coin }),
    ]);
    if (!ctxRes.ok) return json({ error: `Hyperliquid HTTP ${ctxRes.status}` }, ctxRes.status);

    const [meta, ctxs] = await ctxRes.json();
    const rawTrades = tradesRes.ok ? await tradesRes.json() : [];

    // ---- Market-wide positioning ----
    const markets = [];
    (meta?.universe || []).forEach((u, i) => {
      const c = ctxs?.[i];
      if (!u?.name || u.isDelisted || !c) return;
      const mark = Number(c.markPx) || 0;
      const oi   = Number(c.openInterest) || 0;
      const prev = Number(c.prevDayPx) || 0;
      if (!mark || !oi) return;
      const funding = Number(c.funding) || 0;
      markets.push({
        coin: u.name,
        mark, oiCoin: oi, oiUsd: oi * mark,
        dayNtlVlm: Number(c.dayNtlVlm) || 0,
        // Hyperliquid funding is charged hourly, so annualising is x24x365
        fundingHourly: funding,
        fundingApr: +(funding * 24 * 365 * 100).toFixed(2),
        changePct: prev ? +((mark - prev) / prev * 100).toFixed(2) : null,
      });
    });
    markets.sort((a, b) => b.oiUsd - a.oiUsd);

    const totalOiUsd = markets.reduce((s, m) => s + m.oiUsd, 0);
    const totalVlm   = markets.reduce((s, m) => s + m.dayNtlVlm, 0);

    // Crowding: funding is what longs pay shorts (or vice versa) to hold. The
    // extremes are where positioning is stretched, so surface both tails from
    // markets liquid enough for the number to mean anything.
    const liquid = markets.filter(m => m.oiUsd > 1e6);
    const byFunding = liquid.slice().sort((a, b) => b.fundingApr - a.fundingApr);
    const crowdedLongs  = byFunding.slice(0, 6);
    const crowdedShorts = byFunding.slice(-6).reverse();

    // ---- Wallet-attributed prints for the selected coin ----
    const trades = (Array.isArray(rawTrades) ? rawTrades : []).map(t => ({
      tid: t.tid,
      time: t.time,
      // Hyperliquid marks the aggressor: B = buy lifted the offer
      side: t.side === 'B' ? 'BUY' : 'SELL',
      px: Number(t.px), sz: Number(t.sz),
      usd: Number(t.px) * Number(t.sz),
      users: t.users || [],
    })).filter(t => t.px > 0 && t.sz > 0);

    return json({
      coin,
      trades,
      tradeWindowMs: trades.length ? trades[0].time - trades[trades.length - 1].time : 0,
      markets: markets.slice(0, 40),
      crowdedLongs, crowdedShorts,
      totals: {
        totalOiUsd: Math.round(totalOiUsd),
        totalDayVolume: Math.round(totalVlm),
        marketCount: markets.length,
      },
      note: 'No crypto equivalent of FINRA ATS reporting exists. This is wallet-attributed tape plus positioning, not hidden volume.',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message, coin }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=2, stale-while-revalidate=5',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
