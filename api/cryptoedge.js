export const config = { runtime: 'edge' };

// Crypto market context — the reads that actually change a trade decision,
// rather than more price displays.
//
// SOURCES AND WHY THESE ONES:
//   OKX      — open interest history, long/short account ratio, taker buy/sell
//              volume. Binance publishes the same set and is the usual source,
//              but it answers HTTP 451 (geo-restricted) from this
//              infrastructure, so OKX is used instead. Verified working.
//   Deribit  — DVOL (the crypto VIX) and realized volatility, which together
//              give the volatility risk premium.
//   alternative.me — Fear & Greed, for sentiment context only.
//
// THE CENTRAL READ IS OPEN INTEREST vs PRICE. It is the closest thing crypto
// has to knowing whether a move is real:
//   OI up   + price up    -> NEW LONGS      (fresh money, trend has fuel)
//   OI up   + price down  -> NEW SHORTS     (fresh money, bearish conviction)
//   OI down + price up    -> SHORT COVERING (a squeeze, not accumulation —
//                                            fades once shorts are done)
//   OI down + price down  -> LONG LIQUIDATION (forced selling, exhausts)
// The two "OI down" cases are the ones that trap people: the move looks strong
// but it is positions closing, not new conviction arriving.

const OKX = 'https://www.okx.com/api/v5';
const DERIBIT = 'https://www.deribit.com/api/v2/public';

const jget = async (u) => {
  try {
    const r = await fetch(u, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
};

export default async function handler(req) {
  const url  = new URL(req.url);
  const coin = (url.searchParams.get('coin') || 'BTC').toUpperCase();

  try {
    const now = Date.now();
    const [oiRes, candleRes, lsRes, takerRes, dvolRes, hvRes, fngRes] = await Promise.all([
      jget(`${OKX}/rubik/stat/contracts/open-interest-volume?ccy=${coin}&period=1H`),
      jget(`${OKX}/market/candles?instId=${coin}-USDT-SWAP&bar=1H&limit=25`),
      jget(`${OKX}/rubik/stat/contracts/long-short-account-ratio?ccy=${coin}&period=1H`),
      jget(`${OKX}/rubik/stat/taker-volume?ccy=${coin}&instType=CONTRACTS&period=1H`),
      // DVOL and realized vol exist for BTC and ETH only
      (coin === 'BTC' || coin === 'ETH')
        ? jget(`${DERIBIT}/get_volatility_index_data?currency=${coin}&start_timestamp=${now - 86400000}&end_timestamp=${now}&resolution=3600`)
        : Promise.resolve(null),
      (coin === 'BTC' || coin === 'ETH') ? jget(`${DERIBIT}/get_historical_volatility?currency=${coin}`) : Promise.resolve(null),
      jget('https://api.alternative.me/fng/?limit=1'),
    ]);

    // ---- Open interest vs price ----
    // OKX returns newest-first: [ts, oiUsd, volUsd]
    const oiRows = (oiRes?.data || []).map(r => ({ ts: +r[0], oiUsd: +r[1], volUsd: +r[2] })).filter(r => r.oiUsd > 0);
    const pxRows = (candleRes?.data || []).map(r => ({ ts: +r[0], close: +r[4] })).filter(r => r.close > 0);

    let oiNow = null, oiPrev = null, oiChangePct = null;
    let pxNow = null, pxPrev = null, pxChangePct = null, regime = null, regimeNote = null;

    if (oiRows.length >= 2 && pxRows.length >= 2) {
      const back = Math.min(24, oiRows.length - 1, pxRows.length - 1);
      oiNow = oiRows[0].oiUsd; oiPrev = oiRows[back].oiUsd;
      pxNow = pxRows[0].close; pxPrev = pxRows[back].close;
      oiChangePct = +((oiNow - oiPrev) / oiPrev * 100).toFixed(2);
      pxChangePct = +((pxNow - pxPrev) / pxPrev * 100).toFixed(2);

      // A move under 0.15% either way is noise, not a regime
      const oiUp = oiChangePct > 0.15, oiDn = oiChangePct < -0.15;
      const pxUp = pxChangePct > 0.15, pxDn = pxChangePct < -0.15;
      if (oiUp && pxUp)      { regime = 'NEW LONGS';        regimeNote = 'Fresh money is buying. Open interest and price rising together is the healthiest version of a rally — the trend has fuel behind it.'; }
      else if (oiUp && pxDn) { regime = 'NEW SHORTS';       regimeNote = 'Fresh money is selling. New positions opening into falling price is genuine bearish conviction, not just longs giving up.'; }
      else if (oiDn && pxUp) { regime = 'SHORT COVERING';   regimeNote = 'Positions are CLOSING, not opening. This is a squeeze, not accumulation — it tends to stall once shorts are done, so chasing it late is how people get trapped.'; }
      else if (oiDn && pxDn) { regime = 'LONG LIQUIDATION'; regimeNote = 'Forced selling. Leveraged longs are being closed out, which exhausts itself — often near a local low rather than at the start of one.'; }
      else                   { regime = 'NEUTRAL';          regimeNote = 'Neither open interest nor price has moved enough over 24h to read a regime.'; }
    }

    // ---- Retail positioning ----
    // OKX gives the ratio of accounts long to accounts short. It is a
    // contrarian gauge at the extremes and noise in the middle.
    const lsRows = (lsRes?.data || []).map(r => ({ ts: +r[0], ratio: +r[1] })).filter(r => r.ratio > 0);
    const lsRatio = lsRows[0]?.ratio ?? null;
    const lsPrev  = lsRows[Math.min(23, lsRows.length - 1)]?.ratio ?? null;

    // ---- Aggressive flow ----
    // [ts, buyVol, sellVol] — who is crossing the spread rather than resting
    const tkRows = (takerRes?.data || []).map(r => ({ ts: +r[0], buy: +r[1], sell: +r[2] }));
    let takerBuy = 0, takerSell = 0;
    for (const r of tkRows.slice(0, 24)) { takerBuy += r.buy; takerSell += r.sell; }
    const takerBuyShare = takerBuy + takerSell > 0 ? +(takerBuy / (takerBuy + takerSell) * 100).toFixed(1) : null;

    // ---- Volatility risk premium ----
    // DVOL is the market's implied vol; historical is what actually happened.
    // IV above RV means options are expensive relative to delivered movement.
    const dvolSeries = dvolRes?.result?.data || [];
    const dvol = dvolSeries.length ? dvolSeries[dvolSeries.length - 1][4] : null;
    const dvolOpen = dvolSeries.length ? dvolSeries[0][1] : null;
    const hvSeries = hvRes?.result || [];
    const realizedVol = hvSeries.length ? +hvSeries[hvSeries.length - 1][1].toFixed(2) : null;
    const volPremium = dvol != null && realizedVol != null ? +(dvol - realizedVol).toFixed(2) : null;

    const fng = fngRes?.data?.[0];

    return json({
      coin,
      openInterest: {
        usd: oiNow, usd24hAgo: oiPrev, changePct: oiChangePct,
        priceNow: pxNow, price24hAgo: pxPrev, priceChangePct: pxChangePct,
        regime, regimeNote,
        history: oiRows.slice(0, 24).reverse(),
      },
      positioning: {
        longShortRatio: lsRatio,
        longShortRatio24hAgo: lsPrev,
        // Above 1 means more accounts long than short
        skew: lsRatio == null ? null : lsRatio > 1.3 ? 'CROWDED LONG' : lsRatio < 0.8 ? 'CROWDED SHORT' : 'BALANCED',
        history: lsRows.slice(0, 24).reverse(),
      },
      takerFlow: {
        buyVolume: Math.round(takerBuy), sellVolume: Math.round(takerSell),
        buyShare: takerBuyShare,
        history: tkRows.slice(0, 24).reverse(),
      },
      volatility: {
        dvol, dvol24hAgo: dvolOpen, realizedVol,
        premium: volPremium,
        read: volPremium == null ? null
          : volPremium > 3  ? 'Options are RICH — implied vol is well above what price is actually delivering, which favours selling premium over buying it.'
          : volPremium < -3 ? 'Options are CHEAP — price is moving more than options are pricing in, which favours buying premium (and makes stop-outs on short-vol trades more likely).'
          : 'Implied and realized vol are close — no meaningful edge either way on option premium.',
        available: dvol != null,
      },
      sentiment: fng ? {
        value: Number(fng.value),
        label: fng.value_classification,
        note: 'Contrarian at the extremes only. Mid-range readings carry no signal.',
      } : null,
      sources: 'OKX (open interest, long/short, taker volume) · Deribit (DVOL, realized vol) · alternative.me (Fear & Greed)',
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
      'Cache-Control': 's-maxage=60, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
