// P21: Build ID is written to sw-version.js by next.config.js webpack hook on each build.
// importScripts loads it here so the cache name auto-busts on every deployment.
try { importScripts('/sw-version.js'); } catch (_) {}
const CACHE_NAME = `flowtiq-shell-${self.SW_BUILD_ID || 'dev'}`;
const API_URL_PREFIX = '/api/';

self.addEventListener('install', (event) => {
  // Skip waiting immediately — no navigation URLs pre-cached (see fetch handler).
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls or navigation requests.
  // Next.js App Router relies on the server returning the correct HTML for each URL;
  // serving a cached root-page response for /dashboard, /projects, etc. causes a
  // redirect loop because the root page always redirects back to /dashboard.
  if (url.pathname.startsWith(API_URL_PREFIX) || request.mode === 'navigate') {
    return;
  }

  // Static assets (/_next/static/): cache-first, cache new assets on miss
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        });
      })
    );
    return;
  }
});
