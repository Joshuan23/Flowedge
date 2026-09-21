export const config = { runtime: 'edge' };

// Resolves a tracked stock setup into an outcome by replaying the candles that
// printed since it opened. Mirror of /api/cryptoresolve, on Yahoo intraday bars.
//
// WHY REPLAY RATHER THAN WATCH LIVE: a browser tab is not a reliable observer.
// Close it over a weekend and a live-price tracker misses whatever resolved,
// biasing the forward record toward trades that happened while someone was
// watching — the exact selection bias that makes a track record worthless.
//
// MANAGEMENT MODELLED, matching the rest of the app: bank half at TP1, stop to
// breakeven, run the remainder to TP2.
//
// CONSERVATIVE TIE-BREAK: when one bar touches both the stop and a target the
// stop is taken first. Intrabar sequence is unknowable from OHLC and assuming
// the good fill would flatter every result.
//
// EQUITY-SPECIFIC CAVEAT: stocks gap. A gap through the stop fills at the open,
// not at the stop price, so the realised loss can exceed 1R — that is modelled
// here rather than pretending stops are guaranteed.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req) {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get('symbol') || '').toUpperCase();
  const dir    = (u.searchParams.get('dir') || 'LONG').toUpperCase();
  const entry  = Number(u.searchParams.get('entry'));
  const stop   = Number(u.searchParams.get('stop'));
  const tp1    = Number(u.searchParams.get('tp1'));
  const tp2    = Number(u.searchParams.get('tp2')) || null;
  const since  = Number(u.searchParams.get('since'));

  if (!symbol || !entry || !stop || !tp1 || !since) {
    return json({ error: 'symbol, entry, stop, tp1 and since are all required' }, 400);
  }

  const isLong = dir === 'LONG';
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return json({ error: 'Invalid stop — zero risk' }, 400);
  const rr1 = Math.abs(tp1 - entry) / risk;
  const rr2 = tp2 ? Math.abs(tp2 - entry) / risk : null;

  try {
    // 30m bars cover up to 60 days of intraday history — enough for a
    // multi-day swing, fine enough that stop and target rarely share a bar
    const ageDays = (Date.now() - since) / 86400000;
    const interval = ageDays > 55 ? '1d' : '30m';
    const range = ageDays > 55 ? '6mo' : '60d';
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`,
      { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!r.ok) return json({ error: `Yahoo HTTP ${r.status}`, symbol }, r.status);

    const res = (await r.json())?.chart?.result?.[0];
    const ts = res?.timestamp || [];
    const q  = res?.indicators?.quote?.[0] || {};
    const bars = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i] * 1000;
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (t < since || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
      bars.push({ t, o: Number.isFinite(o) ? o : c, h, l, c });
    }

    if (!bars.length) {
      return json({ symbol, status: 'open', rMultiple: null, bars: 0, note: 'No bars since the setup opened yet.' });
    }

    let tp1Hit = false, prevClose = null;
    let status = 'open', outcome = null, rMultiple = null, exitPrice = null, exitAt = null, gapped = false;

    for (const b of bars) {
      // Gap handling: if the bar OPENS beyond the stop, that is where you get
      // out — not at the stop price. Equity stops are not guaranteed.
      const gapThroughStop = prevClose != null && (isLong ? b.o <= stop : b.o >= stop);

      if (!tp1Hit) {
        const stopHit = isLong ? b.l <= stop : b.h >= stop;
        const tgtHit  = isLong ? b.h >= tp1  : b.l <= tp1;
        if (stopHit) {
          const fill = gapThroughStop ? b.o : stop;
          gapped = gapThroughStop;
          rMultiple = +(((isLong ? fill - entry : entry - fill)) / risk).toFixed(3);
          status = 'closed'; outcome = gapped ? 'GAPPED THROUGH STOP' : 'STOPPED';
          exitPrice = +fill.toFixed(4); exitAt = b.t; break;
        }
        if (tgtHit) { tp1Hit = true; exitAt = b.t; }
        prevClose = b.c;
        continue;
      }
      const beHit  = isLong ? b.l <= entry : b.h >= entry;
      const tp2Hit = tp2 ? (isLong ? b.h >= tp2 : b.l <= tp2) : false;
      if (beHit) {
        status = 'closed'; outcome = 'TP1 THEN BREAKEVEN';
        rMultiple = +(0.5 * rr1).toFixed(3);
        exitPrice = entry; exitAt = b.t; break;
      }
      if (tp2Hit) {
        status = 'closed'; outcome = 'TP1 AND TP2';
        rMultiple = +(0.5 * rr1 + 0.5 * rr2).toFixed(3);
        exitPrice = tp2; exitAt = b.t; break;
      }
      prevClose = b.c;
    }

    const last = bars[bars.length - 1].c;
    if (status === 'open') {
      const move = isLong ? last - entry : entry - last;
      return json({
        symbol, status: tp1Hit ? 'open-after-tp1' : 'open', tp1Hit,
        outcome: tp1Hit ? 'TP1 banked, running to TP2' : null,
        unrealisedR: +(move / risk).toFixed(3),
        lockedR: tp1Hit ? +(0.5 * rr1).toFixed(3) : null,
        lastPrice: last, bars: bars.length, interval,
        openedAt: since, elapsedHours: +((Date.now() - since) / 3600000).toFixed(1),
      });
    }

    return json({
      symbol, status, outcome, rMultiple, exitPrice, exitAt, tp1Hit, gapped,
      lastPrice: last, bars: bars.length, interval,
      openedAt: since, elapsedHours: +((exitAt - since) / 3600000).toFixed(1),
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
      'Cache-Control': 's-maxage=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
