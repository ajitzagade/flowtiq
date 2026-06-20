// P21: Build ID is written to sw-version.js by next.config.js webpack hook on each build.
// importScripts loads it here so the cache name auto-busts on every deployment.
try { importScripts('/sw-version.js'); } catch (_) {}
const CACHE_NAME = `flowtiq-shell-${self.SW_BUILD_ID || 'dev'}`;
const API_URL_PREFIX = '/api/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    }).then(() => self.skipWaiting())
  );
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

  // Never cache API calls
  if (url.pathname.startsWith(API_URL_PREFIX)) {
    return;
  }

  // Navigation requests: cache-first with network fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((cached) => cached || fetch(request))
    );
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
