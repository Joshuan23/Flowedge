export const config = { runtime: 'edge' };

// Whole-market structural scan.
//
// WHY THIS IS SPLIT FROM /api/cryptosignal: full confluence scoring needs OKX
// open-interest history, long/short ratio and taker volume — three requests per
// coin. Measured against the live API, 55 coins clear the structural filter, so
// scoring them all here would be ~165 OKX requests, roughly 20s, and OKX starts
// rate-limiting around 8% of requests past concurrency 4. That does not fit in
// one edge invocation.
//
// So this endpoint answers the cheap half of the question — WHERE DOES
// STRUCTURE ALLOW A TRADE AT ALL — across every liquid perp, in about four
// seconds and using only Hyperliquid, which has no rate limit worth worrying
// about. The client then deep-scans the shortlist through /api/cryptosignal,
// where the browser has no single-request timeout and results can stream in.
//
// Crucially, the levels here come from the same _cryptocore module the detail
// view uses, so a coin cannot be listed at one R multiple and show another when
// opened.

import { structureFrom, buildSetup, splitLevels, prec } from './_cryptocore.js';

const HL = 'https://api.hyperliquid.xyz/info';

const hl = async (body) => {
  try {
    const r = await fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

export default async function handler(req) {
  const url = new URL(req.url);
  // Liquidity floors, because a setup you cannot fill is not a setup. Both
  // default to $1M and are adjustable.
  const minOi  = Number(url.searchParams.get('minOi'))  || 1_000_000;
  const minVol = Number(url.searchParams.get('minVol')) || 1_000_000;

  try {
    const t0 = Date.now();
    const [ctx, mids] = await Promise.all([
      hl({ type: 'metaAndAssetCtxs' }),
      hl({ type: 'allMids' }),
    ]);
    const [meta, ctxs] = ctx || [];
    if (!meta?.universe) return json({ error: 'Could not load the perp universe' }, 502);

    const universe = meta.universe.map((u, i) => ({ u, c: ctxs?.[i] }))
      .filter(x => x.u?.name && !x.u.isDelisted && x.c && mids?.[x.u.name] != null)
      .map(({ u, c }) => {
        const mark = Number(c.markPx) || 0;
        const oi   = Number(c.openInterest) || 0;
        const prev = Number(c.prevDayPx) || 0;
        const funding = Number(c.funding) || 0;
        return {
          coin: u.name, mark, oiUsd: oi * mark,
          volUsd: Number(c.dayNtlVlm) || 0,
          fundingApr: +(funding * 24 * 365 * 100).toFixed(2),
          changePct: prev ? +((mark - prev) / prev * 100).toFixed(2) : null,
        };
      });

    const liquid = universe.filter(r => r.oiUsd >= minOi && r.volUsd >= minVol);

    // Candles in parallel. Measured: 85 coins at concurrency 12 in ~2.3s with
    // zero failures, so this is the cheap part.
    const CONC = 12;
    const now = Date.now();
    const candidates = [];
    for (let i = 0; i < liquid.length; i += CONC) {
      await Promise.all(liquid.slice(i, i + CONC).map(async r => {
        const raw = await hl({
          type: 'candleSnapshot',
          req: { coin: r.coin, interval: '1h', startTime: now - 100 * 3600000, endTime: now },
        });
        if (!Array.isArray(raw) || raw.length < 30) return;
        const candles = raw.map(b => ({ t: +b.t, h: +b.h, l: +b.l, c: +b.c }))
          .filter(b => b.c > 0).sort((a, b) => a.t - b.t);
        if (candles.length < 30) return;

        const { atr, swingHigh, swingLow } = structureFrom(candles);
        if (!atr || atr <= 0) return;
        const spot = r.mark;
        const { above, below } = splitLevels([[swingHigh, '48h swing high'], [swingLow, '48h swing low']], spot);

        // Test BOTH directions. Deliberately no directional filter here: the
        // factors that decide direction (open interest regime, long/short,
        // taker flow) are exactly the ones this endpoint cannot afford, so
        // pre-judging direction now would hide coins whose signal comes from
        // data not yet fetched.
        const long  = buildSetup({ dir: 'LONG',  spot, atr, above, below });
        const short = buildSetup({ dir: 'SHORT', spot, atr, above, below });
        if (!long.setup && !short.setup) return;

        candidates.push({
          ...r,
          atr: prec(atr, spot),
          swingHigh: prec(swingHigh, spot),
          swingLow: prec(swingLow, spot),
          // Where price sits in its 48h range — 0 at the low, 100 at the high
          rangePos: swingHigh > swingLow ? +((spot - swingLow) / (swingHigh - swingLow) * 100).toFixed(0) : null,
          viable: {
            LONG:  long.setup  ? { rr: long.setup.tp1.rr,  riskPct: long.setup.riskPct }  : null,
            SHORT: short.setup ? { rr: short.setup.tp1.rr, riskPct: short.setup.riskPct } : null,
          },
        });
      }));
    }

    // Rank by liquidity. A structurally valid setup on a coin you cannot get
    // size into is not worth a deep scan slot ahead of one you can.
    candidates.sort((a, b) => b.oiUsd - a.oiUsd);

    return json({
      scanned: universe.length,
      liquid: liquid.length,
      viable: candidates.length,
      longViable: candidates.filter(c => c.viable.LONG).length,
      shortViable: candidates.filter(c => c.viable.SHORT).length,
      filters: { minOi, minVol },
      candidates,
      elapsedMs: Date.now() - t0,
      note: 'Structural viability only — a target at least 1.5R from a structure-based stop exists in at least one direction. Direction and confluence come from the per-coin deep scan; nothing here is a trade signal on its own.',
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
