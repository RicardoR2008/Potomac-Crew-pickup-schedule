import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
const keyOf = (endpoint) => createHash('sha256').update(endpoint).digest('hex');
export default async (req) => {
  const store = getStore('push-subs');
  if (req.method === 'GET') return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  if (req.method === 'POST') {
    const { subscription, time, clock, focus } = await req.json();
    if (!subscription || !subscription.endpoint) return new Response('bad request', { status: 400 });
    await store.setJSON(keyOf(subscription.endpoint), {
      subscription,
      time: time === 'morning' ? 'morning' : 'evening',
      clock: /^([01]\d|2[0-3]):[0-5]\d$/.test(clock || '') ? clock : undefined,
      focus: focus === 'garbage' || focus === 'recycling' ? focus : 'both',
    });
    return Response.json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const { endpoint } = await req.json();
    if (endpoint) await store.delete(keyOf(endpoint));
    return Response.json({ ok: true });
  }
  return new Response('method not allowed', { status: 405 });
};
