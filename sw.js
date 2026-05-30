// Rafay Chat service worker.
//  • Makes the app installable + gives a basic offline fallback (network-first).
//  • Receives push messages even when the app is fully closed, so it can put a
//    red unread-count badge on the app icon (just like WhatsApp).

// ── Firebase Cloud Messaging (needed so this worker can react to pushes) ──
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDyULp4egjGIXoR9t0v0_KF8Cf4_2VfdqE",
  authDomain: "abdulrafaychat.firebaseapp.com",
  projectId: "abdulrafaychat",
  storageBucket: "abdulrafaychat.firebasestorage.app",
  messagingSenderId: "1078346470566",
  appId: "1:1078346470566:web:489a0d85d89216e5e39067",
  databaseURL: "https://abdulrafaychat-default-rtdb.firebaseio.com"
});

let fcm = null;
try { fcm = firebase.messaging(); } catch (e) { /* messaging not supported here */ }

const CACHE = 'rafay-chat-v1';
const SHELL = ['/chat-app.html', '/icon-192.png', '/icon-512.png', '/favicon.png'];

// ── Unread badge count storage ───────────────────────────────────────────
// A service worker can be shut down and restarted at any time, so we cannot
// keep the count in a normal variable. We store it in the cache instead.
const BADGE_CACHE = 'rafay-badge';
const BADGE_URL = '/__rafay_badge_count__';

async function readBadgeCount() {
  try {
    const c = await caches.open(BADGE_CACHE);
    const r = await c.match(BADGE_URL);
    if (!r) return 0;
    const n = parseInt(await r.text(), 10);
    return isNaN(n) ? 0 : n;
  } catch (e) { return 0; }
}
async function writeBadgeCount(n) {
  try {
    const c = await caches.open(BADGE_CACHE);
    await c.put(BADGE_URL, new Response(String(n)));
  } catch (e) {}
}
async function showIconBadge(n) {
  try {
    if (n > 0 && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(n);
    else if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
  } catch (e) {}
}
async function clearIconBadge() {
  await writeBadgeCount(0);
  try { if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge(); } catch (e) {}
}

// Is the app currently open and in front of the user?
async function appIsInForeground() {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return list.some((c) => c.visibilityState === 'visible' && c.focused);
}

// A new push arrived → bump the badge (and, for data-only messages, show a
// notification). If the app is already open in front of the user, do nothing —
// the app itself handles that case.
async function handleIncoming(payload) {
  if (await appIsInForeground()) return;

  const count = (await readBadgeCount()) + 1;
  await writeBadgeCount(count);
  await showIconBadge(count);

  // If the message has its own "notification" part, Firebase shows it for us,
  // so we only show one ourselves for data-only messages (avoids duplicates).
  if (payload && !payload.notification) {
    const d = (payload && payload.data) || {};
    await self.registration.showNotification(d.title || 'Rafay Chat', {
      body: d.body || 'New message',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'rafay-chat',
      renotify: true
    });
  }
}

// Firebase background messages.
if (fcm && fcm.onBackgroundMessage) {
  fcm.onBackgroundMessage((payload) => { handleIncoming(payload); });
}

// ── Install / activate / fetch (kept from the original, network-first) ─────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== BADGE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
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

// ── Tapping a notification opens the app and clears the badge ──────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    await clearIconBadge();
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.includes('/chat-app.html') && 'focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('/chat-app.html');
  })());
});

// ── The app tells us to clear the badge when the user opens/looks at it ────
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'clearBadge') {
    event.waitUntil(clearIconBadge());
  }
});
