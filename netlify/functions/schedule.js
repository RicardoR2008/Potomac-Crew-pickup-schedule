// Netlify Function: fetches the Recycle by City schedule page server-side
// and extracts the pickup rules. The app falls back to built-in rules if this fails.
const PAGE = 'https://www.recyclebycity.com/chicago/schedule/d3b86ab31cba4e1f39a79840fe314444';
const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const dayFrom = (w) => { const k = w.toLowerCase().slice(0, 3); return k in DAYS ? DAYS[k] : null; };
exports.handler = async () => {
  const out = { ok: false, garbageDow: null, recyclingDow: null, recyclingAnchor: null, fetched: new Date().toISOString() };
  try {
    const res = await fetch(PAGE, { headers: { 'User-Agent': 'Mozilla/5.0 (schedule widget)' } });
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, ' ');
    const g = text.match(/Garbage\s*=?\s*(?:every\s+)?(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*day/i);
    const r = text.match(/Recycling\s*=?\s*every\s+other\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*day/i);
    if (g) out.garbageDow = dayFrom(g[1]);
    if (r) out.recyclingDow = dayFrom(r[1]);
    // best-effort: earliest ISO date appearing near the word "recycl" (calendar event data)
    const near = [...html.matchAll(/(\d{4}-\d{2}-\d{2})[\s\S]{0,120}?recycl|recycl[\s\S]{0,120}?(\d{4}-\d{2}-\d{2})/gi)]
      .map(m => m[1] || m[2]).filter(Boolean).sort();
    if (near.length) out.recyclingAnchor = near[0];
    out.ok = out.garbageDow != null || out.recyclingDow != null || !!out.recyclingAnchor;
    return { statusCode: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=43200' }, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) };
  }
};
