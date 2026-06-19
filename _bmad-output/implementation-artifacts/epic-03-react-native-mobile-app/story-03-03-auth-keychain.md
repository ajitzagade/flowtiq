---
epicId: 3
storyId: '03-03'
title: 'Auth: Keychain Storage + Session Injection'
status: review
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
priority: high
estimate: 4
dependencies:
  - '03-02'
---

# Story 3.3 — Auth: Keychain Storage + Session Injection

## Story

**As a** mobile app user,
**I want** to stay logged in between app sessions without re-entering my credentials,
**so that** I can open the app and get straight to work.

---

## Context

JWT tokens must be stored in Keychain (iOS) / Keystore (Android) — never AsyncStorage — per NFR-1-SEC-A. On app launch, if valid tokens exist in Keychain, they are injected into the WebView's session so the web app treats the user as already logged in, without a redirect to `/login`.

The Flowtiq web app uses a Zustand store with localStorage persistence (key: `flowtiq-auth` per the existing codebase). The correct injection approach is to pre-populate `localStorage` with the serialized auth state via `injectedJavaScriptBeforeContentLoaded`, rather than using cookies.

Depends on Story 3.2 (WebView component must exist).

---

## Acceptance Criteria

### AC-1: Read existing auth store shape before implementing

**Given** `apps/admin-portal/src/store/auth.ts`,
**When** the developer reads this file,
**Then** the exact localStorage key and serialized state shape is confirmed.

The known shape (from memory — verify before implementing):
- Key: `flowtiq-auth`
- Value: Zustand persist format: `{ "state": { "user": {...}, "token": "...", "refreshToken": "..." }, "version": 0 }`

If the shape differs from the above, use the actual shape found in the file.

### AC-2: Token storage on login

**Given** a new `STORE_TOKENS` bridge message type added to the bridge handler,
**When** the web app sends `STORE_TOKENS` after a successful login with `payload: { accessToken, refreshToken, user }`,
**Then** the tokens are stored in Keychain using `react-native-keychain`:
```typescript
await Keychain.setGenericPassword('flowtiq-auth', JSON.stringify({ accessToken, refreshToken, user }));
```
**And** the stored data is never written to AsyncStorage.
**And** the `STORE_TOKENS` type is added to the bridge allowlist.

Note: The web app (Story 2.4 or login flow) must be updated to send this bridge message after login. If this creates a circular dependency, the alternative is: detect WebView URL changing away from `/login` and read the auth state from injected JS (see AC-4 alternative).

### AC-3: Token retrieval on app launch

**Given** the app is launched and `MainScreen` initializes,
**When** the component mounts,
**Then** `Keychain.getGenericPassword()` is called.
**And** if credentials exist, the stored JSON is parsed to extract `accessToken`, `refreshToken`, and `user`.

### AC-4: Auth state injected into WebView localStorage

**Given** valid tokens retrieved from Keychain on app launch,
**When** the WebView is about to load,
**Then** the auth state is injected via `injectedJavaScriptBeforeContentLoaded` before the web app initializes:

```javascript
(function() {
  const authState = ${JSON.stringify(zustandPersistedState)};
  localStorage.setItem('flowtiq-auth', JSON.stringify(authState));
})();
```

Where `zustandPersistedState` matches the format:
```json
{
  "state": { "user": {...}, "token": "accessToken", "refreshToken": "refreshToken" },
  "version": 0
}
```

**And** this injection happens BEFORE `window.NativeBridge` injection (both can be combined in the same `injectedJavaScriptBeforeContentLoaded` script).
**And** after injection, the web app loads and reads `flowtiq-auth` from localStorage, treating the user as logged in.

### AC-5: No re-authentication required after app relaunch

**Given** a user who previously logged in and closed the app,
**When** they reopen the app,
**Then** the app loads directly to the dashboard (or last visited page) without showing the login screen.
**And** the web app's Zustand auth state is populated from the injected localStorage value.

### AC-6: Token cleared on logout

**Given** the web app sends a `LOGOUT` bridge message (new bridge type) or navigates to `/login`,
**When** this is detected by the native shell,
**Then** `Keychain.resetGenericPassword()` is called to clear stored tokens.
**And** the module-level push token variable is cleared (coordinate with Story 3.4).

Detection approach: add a `LOGOUT` bridge message type (add to allowlist), or use `onNavigationStateChange` to detect URL changes to `/login`.

### AC-7: Fresh install / no stored tokens

**Given** a fresh app install with no Keychain credentials,
**When** the app launches,
**Then** no auth injection is attempted.
**And** the WebView loads normally and the web app redirects to `/login`.

### AC-8: Keychain error handling

**Given** any Keychain operation fails (e.g. biometric prompt declined, hardware error),
**When** the error occurs,
**Then** the error is caught and logged.
**And** the app falls back to loading the WebView without injection (user will see login screen).
**And** no crash or unhandled exception occurs.

### AC-9: Security constraints met

**Given** the token storage implementation,
**When** reviewed against NFR-1-SEC-A,
**Then** `AsyncStorage` is NOT used anywhere in the auth token flow.
**And** only `react-native-keychain` is used for token persistence.
**And** tokens are not logged to the console in production builds.

### AC-10: `pnpm type-check` passes

**Given** all new TypeScript in `apps/mobile`,
**When** `pnpm --filter @flowtiq/mobile type-check` runs,
**Then** zero TypeScript errors.

---

## Implementation Notes

### Web app change required (coordinate with Story 2.4)

The web app's login success handler needs to send a `STORE_TOKENS` bridge message. This can be added in the same place as the push token registration in Story 2.4:

```typescript
// In login success handler (web app)
if (isNativeApp()) {
  window.NativeBridge!.postMessage(JSON.stringify({
    type: 'STORE_TOKENS',
    requestId: crypto.randomUUID(),
    payload: { accessToken, refreshToken, user }
  }));
}
```

If Story 2.4 is implemented first, add the `STORE_TOKENS` call there. If 2.4 is not yet done, add it directly in the login page success handler.

### Keychain service identifier

Use a consistent `Keychain.Options` service string:
```typescript
const KEYCHAIN_SERVICE = 'com.flowtiq.auth';
const options: Keychain.Options = { service: KEYCHAIN_SERVICE };
```

This ensures tokens are scoped and not mixed with other app data.

### Combined injected script

Merge the NativeBridge injection (Story 3.2) with the auth injection into a single `injectedJavaScriptBeforeContentLoaded` string to avoid ordering issues:

```typescript
const buildInjectedScript = (platform: string, authState: object | null): string => `
  (function() {
    // Auth injection
    ${authState ? `localStorage.setItem('flowtiq-auth', ${JSON.stringify(JSON.stringify(authState))});` : ''}

    // NativeBridge injection
    window.NativeBridge = {
      platform: '${platform}',
      postMessage: function(msg) { window.ReactNativeWebView.postMessage(msg); }
    };
  })();
  true;
`;
```

### Zustand persist state format

The Zustand `persist` middleware wraps state as `{ state: <store state>, version: <number> }`. Read `apps/admin-portal/src/store/auth.ts` to confirm the exact key name and version number before hardcoding.

---

## Out of Scope

- Biometric authentication (deferred per Decision #10 / NFR future phase)
- Token refresh handling in native layer (web app's axios interceptor handles refresh; the native shell only stores tokens, it does not refresh them)
- Multiple account support
- Secure enclave / hardware-backed key attestation (Keychain defaults are sufficient for Phase 2)

---

## Definition of Done

- [ ] `STORE_TOKENS` bridge message type added to allowlist and handler
- [ ] Tokens stored in Keychain on login (not AsyncStorage)
- [ ] Tokens retrieved from Keychain on app launch
- [ ] Auth state injected into WebView localStorage before page load
- [ ] App loads to dashboard without re-login after relaunch
- [ ] Keychain cleared on logout (LOGOUT bridge type or URL detection)
- [ ] Fresh install shows login screen
- [ ] All Keychain errors caught and handled gracefully
- [ ] `pnpm type-check` passes
