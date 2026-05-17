/**
 * Firebase Messaging service worker.
 *
 * Receives data-only push messages from FCM in the background and renders
 * them as system notifications with our own R icon.
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

// Read from payload.data (data-only payload from our Cloud Function).
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "Rafay Chat";
  const body = data.body || "";

  const options = {
    body,
    icon: ICON_URL,
    tag: "rafay-chat", // collapses rapid duplicates into one entry
    requireInteraction: false,
    data: {
      url: data.link || "/chat-app.html",
    },
  };

  return self.registration.showNotification(title, options);
});

// Tap-to-open behaviour
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) ||
    "/chat-app.html";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if (w.url.includes("/chat-app.html") && "focus" in w) return w.focus();
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
