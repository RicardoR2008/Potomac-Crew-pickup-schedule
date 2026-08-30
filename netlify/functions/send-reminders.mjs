import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
// Chicago wall-clock parts for a UTC instant
const chicago = (d) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {}); return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute }; };
const DAY = 864e5;
const ANCHOR = Date.UTC(2026, 7, 11); // recycling Tuesday (every other week)
const scheduledTypes = (t) => { const dow = new Date(t).getUTCDay(); const out = []; if (dow === 4) out.push('Garbage'); if (dow === 2 && ((Math.round((t - ANCHOR) / DAY) % 14) + 14) % 14 === 0) out.push('Recycling'); return out; };
// Service-affecting American holidays, computed by rule — same set and same
// weekend-observance convention as the app's HOLIDAYS table (service:true only).
const nthWeekday = (y, m, dow, nth) => {
  if (nth < 0) { const last = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7)); }
  const first = new Date(Date.UTC(y, m, 1));
  return Date.UTC(y, m, 1 + ((dow - first.getUTCDay() + 7) % 7) + (nth - 1) * 7);
};
const observed = (t) => { const w = new Date(t).getUTCDay(); return w === 6 ? t - 864e5 : w === 0 ? t + 864e5 : t; };
const SERVICE_HOLIDAYS = [
  (y) => observed(Date.UTC(y, 0, 1)),        // New Year's Day
  (y) => nthWeekday(y, 0, 1, 3),             // MLK Day
  (y) => Date.UTC(y, 1, 12),                 // Lincoln's Birthday (Chicago)
  (y) => nthWeekday(y, 2, 1, 1),             // Pulaski Day (Chicago)
  (y) => nthWeekday(y, 4, 1, -1),            // Memorial Day
  (y) => observed(Date.UTC(y, 5, 19)),       // Juneteenth
  (y) => observed(Date.UTC(y, 6, 4)),        // Independence Day
  (y) => nthWeekday(y, 8, 1, 1),             // Labor Day
  (y) => nthWeekday(y, 9, 1, 2),             // Columbus Day
  (y) => observed(Date.UTC(y, 10, 11)),      // Veterans Day
  (y) => nthWeekday(y, 10, 4, 4),            // Thanksgiving
  (y) => observed(Date.UTC(y, 11, 25)),      // Christmas Day
];
const holCache = {};
// observed dates can land in a neighbouring year (Jan 1 on a Saturday is
// observed Dec 31 of the year before), so scan neighbours and keep only year y
const holsFor = (y) => {
  if (!holCache[y]) {
    const s = new Set();
    for (const yr of [y - 1, y, y + 1]) for (const f of SERVICE_HOLIDAYS) {
      const t = f(yr);
      if (new Date(t).getUTCFullYear() === y) s.add(t);
    }
    holCache[y] = s;
  }
  return holCache[y];
};
const holOf = (t) => holsFor(new Date(t).getUTCFullYear()).has(t) || undefined;
// holiday earlier in the same Mon-Sun week, on or before the scheduled day → that pickup slides one day later
const weekHol = (t) => { const dow = new Date(t).getUTCDay(); for (let i = 0; i <= (dow + 6) % 7; i++) { if (holOf(t - i * DAY)) return true; } return false; };
const actualTypes = (t) => {
  const out = [];
  const own = scheduledTypes(t);
  if (own.length && !weekHol(t)) out.push(...own);
  const prev = scheduledTypes(t - DAY);
  if (prev.length && weekHol(t - DAY)) out.push(...prev);
  return out;
};
const DEFAULT_CLOCK = { evening: '19:00', morning: '05:30' };
export default async () => {
  const now = chicago(new Date());
  // runs every 15 minutes; each subscription fires in the quarter-hour bucket holding its
  // chosen clock, compared in Chicago wall time so CST/CDT both land correctly
  const bucket = now.hh * 60 + Math.floor(now.mm / 15) * 15;
  const today = Date.UTC(now.y, now.m - 1, now.d);
  const typesByMode = { evening: actualTypes(today + DAY), morning: actualTypes(today) };
  if (!typesByMode.evening.length && !typesByMode.morning.length) return new Response('no pickup today or tomorrow');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:you@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const store = getStore('push-subs');
  const { blobs } = await store.list();
  let sent = 0, pruned = 0;
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: 'json' });
    if (!rec) continue;
    const mode = (rec.time || 'evening') === 'morning' ? 'morning' : 'evening';
    let types = typesByMode[mode];
    if (rec.focus === 'garbage') types = types.filter((t) => t === 'Garbage');
    else if (rec.focus === 'recycling') types = types.filter((t) => t === 'Recycling');
    if (!types.length) continue;
    const clock = /^([01]\d|2[0-3]):[0-5]\d$/.test(rec.clock || '') ? rec.clock : DEFAULT_CLOCK[mode];
    const [ch, cm] = clock.split(':').map(Number);
    if (Math.floor((ch * 60 + cm) / 15) * 15 !== bucket) continue;
    const payload = JSON.stringify({ title: types.join(' & ') + ' pickup ' + (mode === 'evening' ? 'tomorrow' : 'today'), body: 'Carts out by 6 AM — 4248 W. Potomac Ave' });
    try { await webpush.sendNotification(rec.subscription, payload); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { await store.delete(b.key); pruned++; } }
  }
  return new Response('sent ' + sent + ', pruned ' + pruned);
};
export const config = { schedule: '*/15 * * * *' };
