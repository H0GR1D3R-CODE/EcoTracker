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
