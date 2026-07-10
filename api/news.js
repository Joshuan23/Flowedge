export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('symbols') || 'SPY';
  const symbols = raw.split(',').slice(0, 6).map(s => s.trim()).filter(Boolean);

  const results = await Promise.all(
    symbols.map(async sym => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=4&quotesCount=0&enableFuzzyQuery=false&region=US`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.news || []).map(n => ({ ...n, querySym: sym }));
      } catch {
        return [];
      }
    })
  );

  // Merge, dedupe by uuid, sort newest first
  const seen = new Set();
  const merged = results
    .flat()
    .filter(n => {
      if (!n.uuid || seen.has(n.uuid)) return false;
      seen.add(n.uuid);
      return true;
    })
    .sort((a, b) => (b.providerPublishTime || 0) - (a.providerPublishTime || 0))
    .slice(0, 20);

  return new Response(JSON.stringify({ news: merged }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=180, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
