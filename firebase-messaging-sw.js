/**
 * Firebase Messaging service worker.
 *
 * Firebase requires this file to be named EXACTLY "firebase-messaging-sw.js"
 * and served from the site root. It runs in the background even when the
 * Rafay Chat app is closed, receives push messages from FCM, and shows them
 * as system notifications.
 *
 * Its scope is "/firebase-cloud-messaging-push-scope" (auto-set by Firebase),
 * so it does NOT intercept any normal page fetches — chat.html and the rest
 * of the site are unaffected.
 */

importScripts(
  "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js"
);

// Same Firebase config as the main app
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

// Show a notification when a push arrives and the app is in the background
messaging.onBackgroundMessage((payload) => {
  const title =
    (payload.notification && payload.notification.title) || "Rafay Chat";
  const body =
    (payload.notification && payload.notification.body) || "";

  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "rafay-chat", // collapses repeats into one entry
    renotify: true,
    data: {
      // Open the app when the user taps the notification
      url: "/chat-app.html",
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
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // If the app is already open, focus it
      for (const w of wins) {
        if (w.url.includes("/chat-app.html") && "focus" in w) return w.focus();
      }
      // Otherwise open a fresh window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
