export const config = { runtime: 'edge' };

// Live L2 order book from Hyperliquid — genuinely real-time depth, free, no key.
//
// This is the one asset class where a real order book is actually obtainable
// without a paid feed: equities market depth requires a Level 2 subscription,
// and FX has no central book at all. Hyperliquid publishes full depth over a
// public endpoint, so perps get a true book while the rest of the app does not.

const HL = 'https://api.hyperliquid.xyz/info';

export default async function handler(req) {
  const url  = new URL(req.url);
  const coin = (url.searchParams.get('coin') || 'BTC').toUpperCase();

  try {
    const [bookRes, midsRes] = await Promise.all([
      fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'l2Book', coin }) }),
      fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'allMids' }) }),
    ]);
    if (!bookRes.ok) return json({ error: `Hyperliquid HTTP ${bookRes.status}`, coin }, bookRes.status);

    const book = await bookRes.json();
    const mids = midsRes.ok ? await midsRes.json() : {};
    const levels = book?.levels;
    if (!Array.isArray(levels) || levels.length < 2) {
      return json({ error: 'No book returned — check the coin symbol', coin, bids: [], asks: [] }, 404);
    }

    // Hyperliquid gives px (price), sz (size in coin), n (number of orders)
    const parse = side => (side || []).map(l => ({
      px: Number(l.px),
      sz: Number(l.sz),
      orders: Number(l.n) || 0,
    })).filter(l => l.px > 0 && l.sz > 0);

    const bids = parse(levels[0]);
    const asks = parse(levels[1]);
    if (!bids.length || !asks.length) return json({ error: 'Empty book', coin, bids: [], asks: [] }, 404);

    const bestBid = bids[0].px;
    const bestAsk = asks[0].px;
    const mid     = Number(mids?.[coin]) || (bestBid + bestAsk) / 2;
    const spread  = bestAsk - bestBid;

    // Running depth so the UI can draw the cumulative curve, plus notional at
    // each level (size alone understates deep levels on high-priced coins)
    let cb = 0, ca = 0;
    const bidRows = bids.map(l => { cb += l.sz; return { ...l, cum: cb, notional: l.px * l.sz, distPct: (l.px - mid) / mid * 100 }; });
    const askRows = asks.map(l => { ca += l.sz; return { ...l, cum: ca, notional: l.px * l.sz, distPct: (l.px - mid) / mid * 100 }; });

    const bidDepth = cb, askDepth = ca;
    const bidNotional = bidRows.reduce((s, l) => s + l.notional, 0);
    const askNotional = askRows.reduce((s, l) => s + l.notional, 0);
    // -100 (all offers) .. +100 (all bids)
    const imbalance = bidDepth + askDepth > 0 ? ((bidDepth - askDepth) / (bidDepth + askDepth)) * 100 : 0;

    // Walls: levels holding an outsized share of their side's depth
    const wall = rows => {
      const total = rows.reduce((s, l) => s + l.sz, 0) || 1;
      return rows.map(l => ({ ...l, share: l.sz / total * 100 }))
        .filter(l => l.share >= 12)
        .sort((a, b) => b.sz - a.sz)
        .slice(0, 3);
    };

    return json({
      coin, mid, bestBid, bestAsk, spread,
      spreadBps: mid > 0 ? (spread / mid) * 10000 : 0,
      bids: bidRows, asks: askRows,
      bidDepth, askDepth, bidNotional, askNotional,
      imbalance,
      bidWalls: wall(bidRows), askWalls: wall(askRows),
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message, coin, bids: [], asks: [] }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // A book is only useful live — cache for a single second so rapid
      // polling from several clients still collapses at the edge
      'Cache-Control': 's-maxage=1',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
