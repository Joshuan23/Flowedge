export const config = { runtime: 'edge' };

// Resolves a tracked signal into an outcome by walking the candles that printed
// since it was opened.
//
// WHY SERVER-SIDE REPLAY RATHER THAN LIVE PRICE WATCHING: a browser tab is not
// a reliable observer. Close the tab for six hours and a live-price tracker
// simply misses whatever happened, which would quietly bias the forward record
// toward trades that resolved while someone was watching — exactly the kind of
// selection bias that makes a track record worthless. Replaying candles from
// the open timestamp gives the same answer whether the tab was open the whole
// time or never reopened until a week later.
//
// MANAGEMENT MODELLED — matches the rest of the app so the numbers are
// comparable to the FX backtests:
//   bank half at TP1, move the stop to breakeven, run the remainder to TP2.
//   Worst case after TP1 is a scratch on the second half, never a loss.
//
// CONSERVATIVE TIE-BREAK: when a single bar touches both the stop and a target,
// the stop is taken first. Intrabar sequence is unknowable from OHLC, and
// assuming the good fill would flatter every result.

const HL = 'https://api.hyperliquid.xyz/info';

const hlPost = async (body) => {
  try {
    const r = await fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

export default async function handler(req) {
  const u = new URL(req.url);
  const coin  = u.searchParams.get('coin') || 'BTC';
  const dir   = (u.searchParams.get('dir') || 'LONG').toUpperCase();
  const entry = Number(u.searchParams.get('entry'));
  const stop  = Number(u.searchParams.get('stop'));
  const tp1   = Number(u.searchParams.get('tp1'));
  const tp2   = Number(u.searchParams.get('tp2')) || null;
  const since = Number(u.searchParams.get('since'));

  if (!entry || !stop || !tp1 || !since) {
    return json({ error: 'entry, stop, tp1 and since are all required' }, 400);
  }

  const isLong = dir === 'LONG';
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return json({ error: 'Invalid stop — zero risk' }, 400);
  const rr1 = Math.abs(tp1 - entry) / risk;
  const rr2 = tp2 ? Math.abs(tp2 - entry) / risk : null;

  try {
    // 15m bars: fine enough that stop and target rarely land in the same bar,
    // coarse enough that a multi-week signal still fits in one request
    const raw = await hlPost({
      type: 'candleSnapshot',
      req: { coin, interval: '15m', startTime: since, endTime: Date.now() },
    });
    const bars = (Array.isArray(raw) ? raw : [])
      .map(b => ({ t: +b.t, h: +b.h, l: +b.l, c: +b.c }))
      .filter(b => b.h > 0 && b.t >= since)
      .sort((a, b) => a.t - b.t);

    if (!bars.length) {
      return json({ coin, status: 'open', rMultiple: null, bars: 0, note: 'No bars since the signal opened yet.' });
    }

    let tp1Hit = false;
    let status = 'open', outcome = null, rMultiple = null, exitPrice = null, exitAt = null;

    for (const b of bars) {
      if (!tp1Hit) {
        const stopHit = isLong ? b.l <= stop : b.h >= stop;
        const tgtHit  = isLong ? b.h >= tp1  : b.l <= tp1;
        if (stopHit) {                       // checked first, deliberately
          status = 'closed'; outcome = 'STOPPED'; rMultiple = -1;
          exitPrice = stop; exitAt = b.t; break;
        }
        if (tgtHit) { tp1Hit = true; exitAt = b.t; }
        continue;
      }
      // Past TP1: half is banked, the stop sits at breakeven
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
    }

    const last = bars[bars.length - 1].c;
    if (status === 'open') {
      // Unrealised, marked to the last close so an open signal still shows
      // where it stands rather than a blank
      const move = isLong ? last - entry : entry - last;
      rMultiple = null;
      return json({
        coin, status: tp1Hit ? 'open-after-tp1' : 'open',
        tp1Hit, outcome: tp1Hit ? 'TP1 banked, running to TP2' : null,
        unrealisedR: +(move / risk).toFixed(3),
        lockedR: tp1Hit ? +(0.5 * rr1).toFixed(3) : null,
        lastPrice: last, bars: bars.length,
        openedAt: since, elapsedHours: +((Date.now() - since) / 3600000).toFixed(1),
      });
    }

    return json({
      coin, status, outcome, rMultiple, exitPrice, exitAt,
      tp1Hit, lastPrice: last, bars: bars.length,
      openedAt: since, elapsedHours: +((exitAt - since) / 3600000).toFixed(1),
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
      'Cache-Control': 's-maxage=30',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
