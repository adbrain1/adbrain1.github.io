// Rafay Chat service worker — makes the app installable and adds a basic
// offline fallback. It is "network-first", so when online everyone always
// gets the freshest chat; the cache is only used when there is no connection.

const CACHE = 'rafay-chat-v1';
const SHELL = ['/chat-app.html', '/icon-192.png', '/icon-512.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Keep a fresh copy of our own files for offline use.
        try {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
        } catch (e) {}
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('/chat-app.html')))
  );
});
