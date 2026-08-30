// Service worker: delivers push reminders and keeps the app usable offline.
// Network-first for the page itself so a new deploy is never masked by cache.
const CACHE = 'pickup-v2';
const ASSETS = ['/', '/favicon-64.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/.netlify/')) return; // never cache function calls
  // page loads: fresh copy when online, last good copy when not
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {}); return res; })
      .catch(() => caches.match('/').then((r) => r || Response.error())));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  })));
});

self.addEventListener('push', (e) => {
  let data = { title: 'Pickup reminder', body: '' };
  try { data = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, tag: 'pickup-reminder', icon: '/icon-192.png', badge: '/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((ws) => (ws.length ? ws[0].focus() : clients.openWindow('/'))));
});
