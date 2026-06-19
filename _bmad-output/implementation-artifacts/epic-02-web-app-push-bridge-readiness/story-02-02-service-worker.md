---
epicId: 2
storyId: '02-02'
title: 'Service Worker for App Shell Caching'
status: ready
priority: medium
estimate: 2
---

# Story 2.2 — Service Worker for App Shell Caching

## Story

**As a** mobile user on a weak or intermittent connection,
**I want** the Flowtiq app shell to load from cache when connectivity drops briefly,
**so that** I can continue using the app without a blank screen during transient network issues.

---

## Context

This story adds a Service Worker to the Next.js admin portal that caches the app shell (static assets: HTML skeleton, JS bundles, CSS). The SW provides resilience during brief connectivity drops — it does not implement offline-first data mutation (that is out of scope for Phase 2). API calls (`/api/*`) are always network-first and not cached.

The SW is placed in `apps/admin-portal/public/sw.js` so Next.js serves it at the root scope (`/sw.js`), giving it control over all pages of the app.

---

## Acceptance Criteria

### AC-1: Service Worker file created

**Given** the path `apps/admin-portal/public/sw.js`,
**When** the file exists,
**Then** it is a valid Service Worker script with `install`, `activate`, and `fetch` event handlers.

### AC-2: App shell assets cached on install

**Given** the SW is installed for the first time,
**When** the `install` event fires,
**Then** the SW opens a cache named `flowtiq-shell-v1` (version controlled via `CACHE_VERSION` constant) and pre-caches the following assets:
- `/` (the root HTML)
- `/_next/static/` bundled JS and CSS files (cache at runtime, not pre-cache, since Next.js hashes filenames)

**And** the SW calls `self.skipWaiting()` in the install handler to activate immediately.

### AC-3: Stale cache purged on activate

**Given** a new SW version is deployed (updated `CACHE_VERSION`),
**When** the `activate` event fires,
**Then** all caches with keys not matching the current `CACHE_VERSION` are deleted.
**And** `self.clients.claim()` is called so the new SW takes control immediately.

### AC-4: Navigation requests served cache-first when offline

**Given** a fetch event for a navigation request (HTML page, `request.mode === 'navigate'`),
**When** the network is unavailable,
**Then** the SW returns the cached `/` HTML from `flowtiq-shell-v1`.
**And** the user sees the cached app shell instead of a browser offline error page.

### AC-5: API requests always network-first (never cached)

**Given** a fetch event for a URL matching `/api/*`,
**When** the SW intercepts it,
**Then** the SW passes the request through to the network without caching.
**And** if the network fails for an API request, the error propagates normally to the web app (no cache fallback for data).

### AC-6: Static assets served cache-first

**Given** a fetch event for a `/_next/static/*` asset (JS bundle, CSS),
**When** the asset exists in the cache,
**Then** the SW returns the cached version immediately without a network request.
**And** when the asset is not in cache, it is fetched from the network and cached for future requests.

### AC-7: SW registered in layout.tsx

**Given** `apps/admin-portal/src/app/layout.tsx`,
**When** the file is updated,
**Then** a `useEffect` (client-side only) registers the SW:

```typescript
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }
}, []);
```

**And** the registration does not block the initial render.
**And** `layout.tsx` remains a `'use client'` component (it already is, per the existing codebase pattern).

### AC-8: CACHE_VERSION controls cache busting

**Given** the SW file has `const CACHE_VERSION = 'v1'`,
**When** a developer increments it to `'v2'`,
**Then** on next SW activation, the old `flowtiq-shell-v1` cache is deleted and a new `flowtiq-shell-v2` cache is created.

### AC-9: No impact on existing browser behavior

**Given** the SW is registered and active,
**When** the user uses the app normally in a browser with connectivity,
**Then** page loads, API calls, and navigation are indistinguishable from behavior before SW registration.
**And** no existing E2E tests fail.

### AC-10: `pnpm build` succeeds

**Given** the SW file in `public/sw.js`,
**When** `pnpm build` runs in `apps/admin-portal`,
**Then** the build completes without error.
**And** `sw.js` is present in the built output at the root.

---

## Implementation Notes

### SW file location
`apps/admin-portal/public/sw.js`

### CACHE_VERSION and cache name

```javascript
const CACHE_VERSION = 'v1';
const CACHE_NAME = `flowtiq-shell-${CACHE_VERSION}`;
const API_URL_PREFIX = '/api/';
```

### Install handler

```javascript
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    }).then(() => self.skipWaiting())
  );
});
```

### Activate handler

```javascript
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
```

### Fetch handler

```javascript
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls
  if (url.pathname.startsWith(API_URL_PREFIX)) {
    return; // let browser handle normally
  }

  // Navigation requests: cache-first with network fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((cached) => cached || fetch(request))
    );
    return;
  }

  // Static assets (/_next/static/): cache-first, then cache new assets
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
```

### layout.tsx addition

Add the `useEffect` registration near the top of the root layout component body. Import `useEffect` from React (it is already a `'use client'` file):

```typescript
useEffect(() => {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('SW registration failed:', err);
    });
  }
}, []);
```

---

## Out of Scope

- Offline-first data mutation (write-and-sync when connectivity restored) — deferred to future phase
- Background sync API
- Push notification handling via SW (handled by the native shell in Epic 3)
- Precaching all Next.js pages (only the root shell is pre-cached; individual pages load on-demand)
- Workbox or other SW libraries (plain SW is sufficient for Phase 2 scope)

---

## Definition of Done

- [ ] `apps/admin-portal/public/sw.js` created with install, activate, fetch handlers
- [ ] API requests pass through without caching
- [ ] Navigation requests served from cache when offline
- [ ] Static assets cached on first load
- [ ] `CACHE_VERSION` controls cache name
- [ ] SW registered in `layout.tsx` with `useEffect`
- [ ] `pnpm build` passes
- [ ] Manual test: load app, go offline in DevTools, reload → app shell appears
