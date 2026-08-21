// EcoTrack/frontend/public/sw.js
// The app shell service worker - what lets EcoTrack open with no connection
// at all, not just log an entry offline (see src/utils/offlineOutbox.js for
// that half of "offline-first").
//
// NO BUILD PLUGIN - deliberately hand-written, the same reasoning as
// weather_engine.py staying framework-free: this is two caching strategies,
// not a reason to add vite-plugin-pwa and its own build-time manifest step.
//
// TWO STRATEGIES, BY REQUEST TYPE
//   1. Navigations (loading a page/route)   -> network-first, falling back
//      to the cached shell offline. Always prefers a live copy when one is
//      reachable, so a deploy is never stuck behind a stale cache.
//   2. Same-origin /assets/* (Vite's hashed JS/CSS bundles) -> cache-first.
//      A hashed filename changes only when its content does, so once cached
//      it is safe to treat as permanent - re-fetching it over the network
//      would only ever return byte-identical content.
//
// Cross-origin requests (the Flask API on Vercel, Google Fonts, Firebase)
// are deliberately left alone - falling through to the network untouched.
// Caching API responses would mean showing stale carbon data with no visual
// indication it is stale, which is a worse experience than a clear network
// error. The outbox is what actually makes logging work offline; this file
// only keeps the app itself loadable.

const CACHE_VERSION = 'ecotrack-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      // Activate this version immediately rather than waiting for every
      // open tab to close first - an app this actively worked on should not
      // need a manual close-and-reopen to pick up a new deploy.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever handle GET - a queued POST from offlineOutbox.js must reach
  // the real network or fail cleanly, never be intercepted here.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API, fonts, Firebase - untouched

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((cached) => cached || Response.error())
      )
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Only cache a genuinely complete response - an opaque or error
            // response cached here would be served as if it were valid forever.
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

// ---------------------------------------------------------------------------
// PUSH NOTIFICATIONS (see src/utils/pushNotifications.js for the other half)
//
// Deliberately NOT the Firebase Messaging SDK's own onBackgroundMessage -
// that needs importScripts('https://www.gstatic.com/firebasejs/.../
// firebase-messaging-compat.js') to run inside this worker, and a failed
// importScripts call (offline, that CDN blocked, a flaky connection right
// as this worker installs) throws and fails the ENTIRE service worker
// registration - which would take the offline app shell above down with
// it for a completely unrelated reason. FCM delivers a standard Push API
// event to whichever service worker owns this scope regardless of which
// SDK is or is not loaded inside it, so a plain `push` listener is both
// simpler and cannot break offline support if push ever misbehaves.
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    return; // Not JSON - nothing this worker knows how to show
  }

  // FCM's webpush notification payload shape (see backend/notifications.py's
  // messaging.Notification) - title/body land under `notification`.
  const title = payload.notification?.title || 'EcoTrack';
  const body = payload.notification?.body || '';
  const link = payload.fcmOptions?.link || payload.data?.link || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.webp',
      badge: '/icons/icon-96.webp',
      data: { link },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an already-open tab rather than piling up a new one, if one exists
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
