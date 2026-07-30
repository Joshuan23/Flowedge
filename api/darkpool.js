export const config = { runtime: 'edge' };

// Dark pool levels from FINRA OTC (ATS) transparency data — the real,
// regulator-published record of off-exchange trading. Free, no API key.
//
// Each row is one ATS venue's weekly activity in one symbol: share quantity
// and notional sum. Dividing them gives that venue's volume-weighted average
// execution price for the week — a genuine price level where institutional
// size traded off-exchange. Aggregating venues per week gives the level, and
// the summed notional gives its weight.
//
// Caveat worth knowing: FINRA publishes this weekly with a ~2-4 week lag
// (Tier 1 NMS on the shorter end), so these are structural levels, not
// same-day prints. The response reports its own freshness so the UI can say so.

const FINRA = 'https://api.finra.org/data/group/otcMarket/name/weeklySummary';

export default async function handler(req) {
  const url    = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || 'SPY').toUpperCase();
  const weeks  = Math.min(parseInt(url.searchParams.get('weeks') || '26', 10) || 26, 52);

  // Look back far enough to cover the requested weeks plus FINRA's lag
  const since = new Date(Date.now() - (weeks + 6) * 7 * 86400e3).toISOString().slice(0, 10);

  try {
    const res = await fetch(FINRA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        limit: 5000,
        compareFilters: [
          { fieldName: 'issueSymbolIdentifier', fieldValue: symbol, compareType: 'EQUAL' },
          { fieldName: 'weekStartDate', fieldValue: since, compareType: 'GTE' },
        ],
      }),
    });

    if (!res.ok) {
      return json({ error: `FINRA HTTP ${res.status}`, symbol, levels: [] }, res.status);
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      return json({ error: rows?.message || 'Unexpected FINRA response', symbol, levels: [] }, 502);
    }
    if (!rows.length) {
      return json({ symbol, levels: [], venues: [], weeksCovered: 0, note: 'No off-exchange data published for this symbol' });
    }

    // FINRA returns four distinct row types per week and they OVERLAP — summing
    // them all would multiple-count the same shares:
    //   ATS_W_SMBL       one aggregate row: all dark pool (ATS) volume        <- the level
    //   ATS_W_SMBL_FIRM  one row per individual ATS venue (sums to the above)
    //   OTC_W_SMBL       one aggregate row: non-ATS off-exchange volume
    //   OTC_W_SMBL_FIRM  one row per wholesaler/internalizer (Citadel, Virtu…)
    // Only the ATS rows are dark pools. The OTC rows are wholesaler
    // internalization — mostly retail flow — so they're reported separately
    // rather than folded into the dark pool levels.
    const num = v => Number(v) || 0;
    const cleanName = r => {
      const raw = (r.marketParticipantName || '').trim();
      if (!raw) return r.MPID || 'Unknown';
      // Names are prefixed with the MPID ("EBXL LEVEL ATS") — strip it
      return r.MPID && raw.startsWith(r.MPID + ' ') ? raw.slice(r.MPID.length + 1) : raw;
    };

    const atsWeek  = new Map();  // week -> { shares, notional, trades }
    const otcWeek  = new Map();  // week -> { shares, notional }
    const weekVenues = new Map();// week -> [{ name, notional, vwap }]
    const byVenue  = new Map();  // venue -> { shares, notional }

    for (const r of rows) {
      const week = r.weekStartDate;
      const shares = num(r.totalWeeklyShareQuantity);
      const notion = num(r.totalNotionalSum);
      if (!week || shares <= 0 || notion <= 0) continue;

      switch (r.summaryTypeCode) {
        case 'ATS_W_SMBL': {
          const a = atsWeek.get(week) || { shares: 0, notional: 0, trades: 0 };
          a.shares += shares; a.notional += notion; a.trades += num(r.totalWeeklyTradeCount);
          atsWeek.set(week, a);
          break;
        }
        case 'OTC_W_SMBL': {
          const o = otcWeek.get(week) || { shares: 0, notional: 0 };
          o.shares += shares; o.notional += notion;
          otcWeek.set(week, o);
          break;
        }
        case 'ATS_W_SMBL_FIRM': {
          const name = cleanName(r);
          if (!weekVenues.has(week)) weekVenues.set(week, []);
          weekVenues.get(week).push({ name, mpid: r.MPID, notional: notion, vwap: notion / shares });
          const v = byVenue.get(name) || { name, mpid: r.MPID, shares: 0, notional: 0 };
          v.shares += shares; v.notional += notion;
          byVenue.set(name, v);
          break;
        }
        default: break; // OTC_W_SMBL_FIRM — wholesaler detail, not a dark pool
      }
    }

    const levels = [...atsWeek.entries()]
      .map(([week, a]) => {
        const vs = (weekVenues.get(week) || []).sort((x, y) => y.notional - x.notional);
        const otc = otcWeek.get(week);
        return {
          week,
          price: +(a.notional / a.shares).toFixed(4),
          notional: Math.round(a.notional),
          shares: a.shares,
          trades: a.trades,
          venues: vs.length,
          otcNotional: otc ? Math.round(otc.notional) : null,
          // Biggest venues that week, each with its own VWAP — shows whether
          // size concentrated in one pool or spread across many
          topVenues: vs.slice(0, 3).map(v => ({
            name: v.name, mpid: v.mpid,
            notional: Math.round(v.notional), price: +v.vwap.toFixed(4),
          })),
        };
      })
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-weeks);

    const venues = [...byVenue.values()]
      .map(v => ({ name: v.name, mpid: v.mpid, notional: Math.round(v.notional), vwap: +(v.notional / v.shares).toFixed(4) }))
      .sort((a, b) => b.notional - a.notional)
      .slice(0, 12);

    const latest = levels.length ? levels[levels.length - 1].week : null;
    const lagDays = latest ? Math.round((Date.now() - new Date(latest + 'T00:00:00Z').getTime()) / 86400e3) : null;

    return json({
      symbol,
      levels,
      venues,
      weeksCovered: levels.length,
      latestWeek: latest,
      lagDays,
      source: 'FINRA OTC (ATS) Transparency — weekly, published with a 2-4 week lag',
    });
  } catch (e) {
    return json({ error: e.message, symbol, levels: [] }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Weekly data — cache hard, it cannot change intraday
      'Cache-Control': 's-maxage=21600, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
