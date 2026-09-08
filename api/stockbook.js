export const config = { runtime: 'edge' };

// Equity top-of-book (NBBO) + best-effort trade tape.
//
// HONEST SCOPE — READ THIS BEFORE TRUSTING THE TAB:
// This is NOT the same thing as the crypto order book. Hyperliquid publishes
// full Level-2 depth for free, so that tab shows every resting order. Equities
// do not work that way: real depth means Nasdaq TotalView / ARCA Book, which is
// a paid market-data subscription with per-user reporting requirements. No free
// endpoint exposes the equity depth ladder, and anything claiming to is either
// reconstructing it badly or reselling a licensed feed.
//
// What IS free and genuine:
//   1. NBBO — the national best bid and offer with their sizes. That is the top
//      of the book, one level deep. Verified live with exchangeDataDelayedBy 0.
//   2. The trade tape — actual prints with size, from Nasdaq's Last Sale feed.
//      Each print is classified against the prevailing NBBO (a print at or above
//      the ask is buyer-initiated, at or below the bid is seller-initiated),
//      which is the standard Lee-Ready style read and is how "where the money is
//      coming from" is actually measured.
//
// So: one level of depth instead of twenty, but a real tape instead of none.
// For equities the tape is the more informative half anyway — resting size can
// be pulled at any instant, whereas a print is money that already changed hands.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function getCrumb() {
  const seed = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const setCookie = seed.headers.get('set-cookie') || '';
  const cookie = setCookie.split(',').map(p => p.split(';')[0].trim()).filter(Boolean).join('; ');
  const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
  });
  return { cookie, crumb: (await res.text()).trim() };
}

const num = s => {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/[,$]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Nasdaq's Last Sale rows only exist during the session; outside it the endpoint
// answers 200 with an empty array rather than an error, so an empty tape is a
// normal closed-market state and not a failure.
async function fetchTape(symbol) {
  try {
    const res = await fetch(
      `https://api.nasdaq.com/api/quote/${symbol}/realtime-trades?&limit=40&offset=0&fromTime=00:00`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.nasdaq.com/' } },
    );
    if (!res.ok) return [];
    const d = await res.json();
    return d?.data?.rows || [];
  } catch { return []; }
}

export default async function handler(req) {
  const url    = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || 'SPY').toUpperCase();

  try {
    const { cookie, crumb } = await getCrumb();
    if (!crumb) return json({ error: 'Could not obtain Yahoo crumb', symbol }, 502);

    const [qRes, tapeRows] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(crumb)}`,
        { headers: { 'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json' } }),
      fetchTape(symbol),
    ]);

    if (!qRes.ok) return json({ error: `Yahoo HTTP ${qRes.status}`, symbol }, qRes.status);
    const q = (await qRes.json())?.quoteResponse?.result?.[0];
    if (!q) return json({ error: `No quote for ${symbol}`, symbol }, 404);

    const bid = Number(q.bid) || null;
    const ask = Number(q.ask) || null;
    // Yahoo publishes NBBO sizes in round lots; shares is the ×100 equivalent
    const bidLots = Number(q.bidSize) || 0;
    const askLots = Number(q.askSize) || 0;
    const last    = Number(q.regularMarketPrice) || null;
    const mid     = bid && ask ? (bid + ask) / 2 : last;
    const spread  = bid && ask ? ask - bid : null;

    // Away from the open, exchanges leave stale one-lot quotes behind that can
    // sit dollars wide. Flag that rather than presenting it as a live market.
    const marketState = q.marketState || 'UNKNOWN';
    const spreadBps = spread != null && mid ? (spread / mid) * 10000 : null;
    const quoteStale = marketState !== 'REGULAR' || (spreadBps != null && spreadBps > 100);

    // Top-of-book size imbalance: -100 (all offered) .. +100 (all bid)
    const totLots = bidLots + askLots;
    const imbalance = totLots > 0 ? ((bidLots - askLots) / totLots) * 100 : 0;

    // Classify each print against the prevailing NBBO. Anything between the
    // quotes is genuinely ambiguous and stays unclassified rather than being
    // guessed into one side.
    let buyVol = 0, sellVol = 0, midVol = 0;
    const prints = [];
    for (const r of tapeRows) {
      const px = num(r.nlsPrice ?? r.price);
      const sz = num(r.nlsShareVolume ?? r.shareVolume ?? r.size);
      const tm = r.nlsTime || r.time || '';
      if (!px || !sz) continue;
      let side = 'MID';
      if (ask && px >= ask) side = 'BUY';
      else if (bid && px <= bid) side = 'SELL';
      if (side === 'BUY') buyVol += sz; else if (side === 'SELL') sellVol += sz; else midVol += sz;
      prints.push({ time: tm, price: px, size: sz, side, notional: px * sz });
    }

    const classified = buyVol + sellVol;
    return json({
      symbol,
      name: q.shortName || q.longName || symbol,
      marketState, quoteStale,
      last, mid, bid, ask, spread, spreadBps,
      bidLots, askLots,
      bidShares: bidLots * 100, askShares: askLots * 100,
      bidNotional: bid ? bid * bidLots * 100 : 0,
      askNotional: ask ? ask * askLots * 100 : 0,
      imbalance,
      prevClose: Number(q.regularMarketPreviousClose) || null,
      dayHigh: Number(q.regularMarketDayHigh) || null,
      dayLow: Number(q.regularMarketDayLow) || null,
      volume: Number(q.regularMarketVolume) || null,
      exchange: q.fullExchangeName || q.exchange || null,
      delayedBy: q.exchangeDataDelayedBy ?? null,
      prints: prints.slice(0, 30),
      tape: {
        buyVol, sellVol, midVol,
        // Share of classified volume that lifted the offer
        buyShare: classified > 0 ? +(buyVol / classified * 100).toFixed(1) : null,
        delta: buyVol - sellVol,
        count: prints.length,
      },
      depth: 'NBBO — top of book only. Equity Level-2 depth requires a paid feed (Nasdaq TotalView); no free source publishes it.',
      ts: Date.now(),
    });
  } catch (e) {
    return json({ error: e.message, symbol }, 500);
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
