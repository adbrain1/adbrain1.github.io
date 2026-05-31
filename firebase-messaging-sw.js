/**
 * Firebase Messaging service worker.
 *
 * Receives data-only push messages from FCM in the background and renders
 * them as system notifications with our own R icon. It also keeps an unread
 * count and shows it as a red badge on the app icon (like WhatsApp), so the
 * badge appears even when the app is fully closed.
 */
importScripts(
  "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js"
);
firebase.initializeApp({
  apiKey: "AIzaSyDyULp4egjGIXoR9t0v0_KF8Cf4_2VfdqE",
  authDomain: "abdulrafaychat.firebaseapp.com",
  projectId: "abdulrafaychat",
  storageBucket: "abdulrafaychat.firebasestorage.app",
  messagingSenderId: "1078346470566",
  appId: "1:1078346470566:web:489a0d85d89216e5e39067",
  databaseURL: "https://abdulrafaychat-default-rtdb.firebaseio.com",
});
const messaging = firebase.messaging();
// Use absolute URL for the icon so it always resolves correctly,
// regardless of which page registered the worker.
const ICON_URL = "https://www.rafaytravelsworldwide.com/icon-192.png";
// Small status-bar icon (must be a flat WHITE-on-transparent PNG, ~72x72).
const BADGE_ICON_URL = "https://www.rafaytravelsworldwide.com/badge-72.png";
// ── Unread badge count ─────────────────────────────────────────────────────
// A service worker can be shut down at any time, so we cannot keep the count
// in a normal variable. We store it in the browser cache, which both this
// worker and the app page can read and reset. The app page clears it (key
// "/__rafay_badge_count__" in cache "rafay-badge") when you open the app.
const BADGE_CACHE = "rafay-badge";
const BADGE_URL = "/__rafay_badge_count__";
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
async function bumpIconBadge() {
  try {
    const count = (await readBadgeCount()) + 1;
    await writeBadgeCount(count);
    if ("setAppBadge" in self.navigator) await self.navigator.setAppBadge(count);
  } catch (e) {}
}
async function clearIconBadge() {
  try {
    await writeBadgeCount(0);
    if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
  } catch (e) {}
}
// Read from payload.data (data-only payload from our Cloud Function).
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "Rafay Chat";
  const body = data.body || "";
  const options = {
    body,
    icon: ICON_URL,
    badge: BADGE_ICON_URL, // small white icon shown in the status bar
    tag: "rafay-chat",     // collapses rapid duplicates into one entry
    renotify: true,        // re-alert (sound/vibration) on each new message
    requireInteraction: false,
    data: {
      url: data.link || "/chat-app.html",
    },
  };
  // Show the notification AND add one to the icon badge.
  return Promise.all([
    self.registration.showNotification(title, options),
    bumpIconBadge(),
  ]);
});
// Tap-to-open behaviour
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) ||
    "/chat-app.html";
  event.waitUntil(
    clearIconBadge().then(() =>
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((wins) => {
          for (const w of wins) {
            if (w.url.includes("/chat-app.html") && "focus" in w) return w.focus();
          }
          if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    )
  );
});
