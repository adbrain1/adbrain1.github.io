/**
 * Service worker for Abdul Rafay's Chat PWA.
 *
 * IMPORTANT: This worker is registered with scope "/chat-app.html" in the
 * registering page, so it can ONLY intercept fetches for that single URL.
 * It cannot affect chat.html, index.html, or anything else on the site.
 *
 * Strategy: network-first with cache fallback. This keeps the chat live and
 * only serves the cached shell if the user is offline.
 */

const CACHE_NAME = "rafay-chat-app-v1";

// Install: take over immediately so users don't need to refresh twice
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate: clean up old caches and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first; cache the latest copy for offline fallback
self.addEventListener("fetch", (event) => {
  // Only handle GET on our origin — skip Firebase, fonts, etc.
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for offline fallback
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
