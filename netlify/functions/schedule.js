// Live pull of the published collection schedule.
//
// Source of truth: the Recycle by City iCalendar feed for this address. It lists
// every collection date explicitly (~2 years ahead), so holiday moves come from
// the city's own published schedule rather than from us guessing a rule. That
// matters: a Monday holiday does NOT push Thursday garbage, but a holiday landing
// ON the collection day moves it EARLIER, and no simple rule captures both.
//
// The response is served with a long CDN cache and a stale-while-revalidate window,
// so this stays fast and keeps working even when the upstream feed is slow or down.
const FEED = 'https://www.recyclebycity.com/chicago/schedule/d3b86ab31cba4e1f39a79840fe314444/subscribe';

// Kept in sync with scripts/make-snapshot: same parse, same dedupe.
function parseIcs(text) {
  const ics = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const seen = new Map();
  for (const block of ics.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const get = (k) => { const m = body.match(new RegExp('^' + k + '[^:]*:(.*)$', 'm')); return m ? m[1].trim() : null; };
    const raw = (get('DTSTART') || '').replace(/[^0-9]/g, '').slice(0, 8);
    const summary = (get('SUMMARY') || '').trim();
    if (raw.length !== 8 || !summary) continue;
    const type = /recycl/i.test(summary) ? 'Recycling' : /garbage|trash|refuse/i.test(summary) ? 'Garbage' : null;
    if (!type) continue;
    const date = raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
    seen.set(date + '|' + type, { d: date, t: type }); // the feed repeats identical rows
  }
  return [...seen.values()].sort((a, b) => (a.d === b.d ? a.t.localeCompare(b.t) : a.d < b.d ? -1 : 1));
}

const fetchWithTimeout = async (url, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (pickup-schedule)', accept: 'text/calendar,*/*' } });
  } finally { clearTimeout(timer); }
};

exports.handler = async () => {
  const headers = {
    'content-type': 'application/json',
    // fresh for 6h at the CDN, but keep serving the old copy for a week while it revalidates
    'cache-control': 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=604800, stale-if-error=604800',
  };
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(FEED, 8000);
      if (!res.ok) throw new Error('feed HTTP ' + res.status);
      const collections = parseIcs(await res.text());
      // a thin parse means the feed changed shape; treat it as a failure rather
      // than silently serving a nearly empty schedule
      if (collections.length < 100) throw new Error('parsed only ' + collections.length + ' collections');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          source: 'recyclebycity.com iCalendar feed',
          fetched: new Date().toISOString(),
          rules: { garbage: 'Thursday', recycling: 'every other Tuesday', cartsOut: '6 AM' },
          coverage: { from: collections[0].d, to: collections[collections.length - 1].d },
          count: collections.length,
          collections,
        }),
      };
    } catch (e) {
      lastError = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  // Upstream unreachable. Report it plainly; the app falls back to its own cached
  // copy and then to the bundled snapshot, so it always has a schedule to show.
  return {
    statusCode: 200,
    headers: { ...headers, 'cache-control': 'public, max-age=60' },
    body: JSON.stringify({ ok: false, error: String((lastError && lastError.message) || 'unknown'), fetched: new Date().toISOString() }),
  };
};
