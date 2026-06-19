---
epicId: 2
storyId: '02-04'
title: 'Push Token Registration on Login'
status: ready
priority: high
estimate: 2
dependencies:
  - '02-01'
  - '01-03'
---

# Story 2.4 — Push Token Registration on Login

## Story

**As a** mobile app user,
**I want** my push notification token to be automatically registered when I log in and removed when I log out,
**so that** push notifications reach my device without any manual setup.

---

## Context

After a user logs in successfully in the web app (inside the native WebView), the NativeBridge SDK is used to retrieve the FCM device token from the native shell. The token is then registered with the backend via `POST /api/users/device-token` (created in Story 1.3). On logout, the token is deregistered via `DELETE /api/users/device-token`.

This flow only runs when `isNativeApp()` is true. In a browser, no token registration occurs.

Depends on Story 2.1 (NativeBridge SDK) and Story 1.3 (Device Token API).

---

## Acceptance Criteria

### AC-1: Token registration triggered after successful login

**Given** a user completes the login flow in the native app,
**When** the Zustand auth store is populated with user data (login success),
**Then** `isNativeApp()` is checked.

**And** if true: `getPushToken()` from the NativeBridge SDK is called.
**And** if a token string is returned (not null): `POST /api/users/device-token` is called with `{ token, platform }`.
**And** the registration is fire-and-forget — it does not block navigation to the dashboard.

### AC-2: Platform detected from NativeBridge

**Given** the native shell sets `window.NativeBridge.platform = 'ios'` or `'android'`,
**When** the token registration call is made,
**Then** `getPlatform()` is called to get the platform value.
**And** the `platform` field in the API request matches the device's actual platform.

### AC-3: Token stored in module-level variable for session

**Given** the token is retrieved successfully,
**When** it is registered with the backend,
**Then** the token string is stored in a module-level variable (not localStorage, not Zustand) in the auth flow module so it can be referenced on logout.

**And** the token is NOT stored in `localStorage` or any persistent browser storage (security requirement NFR-1-SEC-A).

### AC-4: No registration when `getPushToken` returns null

**Given** the user has not granted notification permission,
**When** `getPushToken()` resolves with `null`,
**Then** `POST /api/users/device-token` is NOT called.
**And** no error is logged or thrown.

### AC-5: Token deregistered on logout

**Given** a user clicks logout in the native app,
**When** the logout action is triggered (wherever `useAuthStore` clears the user),
**Then** `isNativeApp()` is checked.
**And** if true and a token is stored in the module variable: `DELETE /api/users/device-token` is called with `{ token }`.
**And** the module-level token variable is cleared after the call.
**And** the logout navigation proceeds regardless of whether the deregistration API call succeeds.

### AC-6: Token deregistration is fire-and-forget

**Given** the logout flow,
**When** `DELETE /api/users/device-token` is called,
**Then** the logout navigation is not blocked by the API call's outcome.
**And** if the API call fails (network error, token already inactive), no error is surfaced to the user.

### AC-7: No effect when not in native app

**Given** the user logs in or out via a browser (not native app),
**When** `isNativeApp()` returns `false`,
**Then** no bridge calls are made.
**And** no device token API calls are made.
**And** the login and logout flows are identical to their behavior before this story.

### AC-8: Existing auth flow unchanged

**Given** the login page and Zustand auth store,
**When** push token registration is added,
**Then** the login success navigation timing, the auth store state shape, and the existing `useAuthStore` API are all unchanged.
**And** existing auth E2E tests still pass.

---

## Implementation Notes

### Where to hook in

Read `apps/admin-portal/src/store/auth.ts` and `apps/admin-portal/src/app/(auth)/login/page.tsx` before implementing to understand the exact login success handler location.

The token registration should be triggered after the auth store is populated — the cleanest place is likely:
1. In the login page's success handler (after `useAuthStore().setUser(...)` or equivalent)
2. Or in a `useEffect` that watches the auth store's user state (fires once when user becomes non-null)

Choose whichever integrates most cleanly with the existing login flow.

### Module-level token storage

```typescript
// In a module shared between login and logout flows
// or as a ref if using a component

let _registeredPushToken: string | null = null;

export async function registerPushTokenIfNative(apiClient: typeof api): Promise<void> {
  if (!isNativeApp()) return;
  const token = await getPushToken();
  const platform = getPlatform();
  if (!token || !platform) return;
  _registeredPushToken = token;
  // fire-and-forget
  apiClient.post('/users/device-token', { token, platform }).catch(console.error);
}

export async function deregisterPushTokenIfNative(apiClient: typeof api): Promise<void> {
  if (!isNativeApp() || !_registeredPushToken) return;
  const token = _registeredPushToken;
  _registeredPushToken = null;
  // fire-and-forget
  apiClient.del('/users/device-token', { data: { token } }).catch(console.error);
}
```

Note: Adapt to the actual API client shape in `src/lib/api.ts`. Read that file first to understand the exact method signatures (`api.post`, `api.del`, etc.).

### API client usage

Use the existing `api` instance from `src/lib/api.ts`. It already handles auth headers via the interceptor. Do not create a new axios instance.

### Logout hook location

Find where logout is handled — most likely in a logout button component or in `useAuthStore`. The deregistration call should be co-located with wherever `useAuthStore().logout()` or the store clear action is called.

---

## Out of Scope

- Push notification permission prompt (displayed by native shell in Epic 3, Story 3.4)
- Token refresh on token rotation (FCM tokens can rotate; handle in a future story)
- Storing the token in the backend's `UserNotificationPreference` (token is in `DeviceToken`, already handled by Story 1.3)
- Re-prompting from Settings (native shell concern, Epic 3)

---

## Definition of Done

- [ ] Token registration called after login success when `isNativeApp()` is true
- [ ] `getPushToken()` used to fetch token; `getPlatform()` for platform
- [ ] Token registered via `POST /api/users/device-token` (fire-and-forget)
- [ ] Token stored in module-level variable (not localStorage)
- [ ] Token deregistered on logout via `DELETE /api/users/device-token` (fire-and-forget)
- [ ] No effect when not in native app
- [ ] Existing login/logout E2E tests pass
- [ ] `pnpm type-check` passes
