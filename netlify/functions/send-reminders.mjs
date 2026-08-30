import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
// Chicago wall-clock parts for a UTC instant
const chicago = (d) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {}); return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute }; };
const ANCHOR = Date.UTC(2026, 7, 11); // recycling Tuesday (every other week)
const pickupTypes = (t) => { const dow = new Date(t).getUTCDay(); const out = []; if (dow === 4) out.push('Garbage'); if (dow === 2 && ((Math.round((t - ANCHOR) / 864e5) % 14) + 14) % 14 === 0) out.push('Recycling'); return out; };
export default async () => {
  const now = chicago(new Date());
  // cron fires at 00/00:30/01/01:30 and 10/10:30/11/11:30 UTC; exactly one run lands on each Chicago slot in either CST or CDT
  const slot = now.hh === 19 && now.mm === 0 ? 'evening' : now.hh === 5 && now.mm === 30 ? 'morning' : null;
  if (!slot) return new Response('off-slot, skipped');
  const target = Date.UTC(now.y, now.m - 1, now.d) + (slot === 'evening' ? 864e5 : 0);
  const types = pickupTypes(target);
  if (!types.length) return new Response('no pickup for ' + new Date(target).toISOString().slice(0, 10));
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:you@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const store = getStore('push-subs');
  const { blobs } = await store.list();
  const payload = JSON.stringify({ title: types.join(' & ') + ' pickup ' + (slot === 'evening' ? 'tomorrow' : 'this morning'), body: 'Carts out by 6 AM \u2014 4248 W. Potomac Ave' });
  let sent = 0, pruned = 0;
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: 'json' });
    if (!rec || (rec.time || 'evening') !== slot) continue;
    try { await webpush.sendNotification(rec.subscription, payload); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { await store.delete(b.key); pruned++; } }
  }
  return new Response('sent ' + sent + ', pruned ' + pruned);
};
export const config = { schedule: '0,30 0,1,10,11 * * *' };
