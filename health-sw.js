// Health Log service worker — makes the app installable on Android & iOS.
// Network-first: when online, always fetch fresh data; cache is for offline use only.

const CACHE = 'health-log-v1';
const SHELL = ['./health.html'];

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

  // Network-first: try the network, fall back to cache when offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache a copy of same-origin resources for offline use
        try {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
        } catch (e) {}
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./health.html')))
  );
});
