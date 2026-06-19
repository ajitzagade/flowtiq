---
epicId: 3
storyId: '03-02'
title: 'WebView + NativeBridge Handler'
status: ready
priority: high
estimate: 5
dependencies:
  - '03-01'
  - '02-01'
---

# Story 3.2 — WebView + NativeBridge Handler

## Story

**As a** mobile app user,
**I want** the Flowtiq web portal to load inside the app and have access to device capabilities,
**so that** I can use all 16 pages and all actions available in the web app, with file operations routed through the device's native pickers.

---

## Context

This story is the core of the mobile app. It creates the `MainScreen` component that hosts the WebView and implements the native side of the NativeBridge — handling all messages posted by the web app's `nativeBridge.ts` SDK (Story 2.1) and dispatching responses back. The WebView is locked down per security NFRs.

Depends on Story 3.1 (project scaffold) and references the message protocol defined in Story 2.1.

---

## Acceptance Criteria

### AC-1: `MainScreen.tsx` created with WebView

**Given** `apps/mobile/src/screens/MainScreen.tsx`,
**When** the component renders,
**Then** a `WebView` from `react-native-webview` loads `Config.TENANT_WEBVIEW_URL` (from `react-native-config`).
**And** the WebView fills the screen (flex: 1) with safe area insets applied.

### AC-2: WebView security configuration

**Given** the WebView component,
**When** configured,
**Then** the following security props are set per NFR-1:
- `originWhitelist={[Config.TENANT_WEBVIEW_URL, 'https://flowtiq-api-production.up.railway.app']}` — only allow the tenant domain and API domain
- `allowFileAccess={false}`
- `allowFileAccessFromFileURLs={false}`
- `allowUniversalAccessFromFileURLs={false}`
- `javaScriptEnabled={true}` (required for the web app)
- `domStorageEnabled={true}` (required for localStorage / Zustand persist)

### AC-3: `NativeBridge.web.js` injected into WebView

**Given** `apps/mobile/src/lib/NativeBridge.web.js`,
**When** the WebView loads,
**Then** this script is injected via `injectedJavaScriptBeforeContentLoaded` prop so it runs before the web app initializes.

**And** the injected script defines `window.NativeBridge` as:
```javascript
window.NativeBridge = {
  platform: '${PLATFORM}', // replaced at runtime with 'ios' or 'android'
  postMessage: function(message) {
    window.ReactNativeWebView.postMessage(message);
  }
};
```

**And** `Platform.OS` from React Native is used to dynamically set the `platform` value in the injected string.

### AC-4: Message handler parses and dispatches by type

**Given** a message posted from the web app via `window.NativeBridge.postMessage(...)`,
**When** the `onMessage` handler fires,
**Then** the message JSON is parsed and the `type` field is read.
**And** the message is dispatched to the appropriate handler function based on type.
**And** if `type` is not in the allowlist, the message is silently ignored (NFR-1-SEC-D).

**Allowlist:** `['FILE_PICK', 'CAMERA_CAPTURE', 'GET_PUSH_TOKEN', 'GET_CONNECTIVITY', 'NAVIGATE']`

### AC-5: Response dispatched back to WebView

**Given** any bridge handler completes (success or failure),
**When** the handler returns a result,
**Then** the native shell calls:
```javascript
webViewRef.current.injectJavaScript(`
  window.dispatchEvent(new CustomEvent('nativeBridgeResponse', {
    detail: ${JSON.stringify({ requestId, success, data, error })}
  }));
  true;
`);
```

**And** the `requestId` in the response matches the `requestId` from the original message.

### AC-6: `FILE_PICK` handler implemented

**Given** a `FILE_PICK` message with `payload: { multiple: boolean, accept?: string }`,
**When** the handler runs,
**Then** `DocumentPicker` from `react-native-document-picker` is invoked.
**And** the selected files are converted to base64 and returned as an array:
```javascript
[{ base64: string, mimeType: string, filename: string }]
```
**And** if the user cancels (DocumentPicker.isCancel error), a failure response is sent with `error: 'User cancelled'`.
**And** all other errors send a failure response with the error message.

### AC-7: `CAMERA_CAPTURE` handler implemented

**Given** a `CAMERA_CAPTURE` message,
**When** the handler runs,
**Then** `launchCamera` from `react-native-image-picker` is invoked in photo mode.
**And** the captured image is converted to base64 and returned as:
```javascript
{ base64: string, mimeType: 'image/jpeg', filename: 'photo.jpg' }
```
**And** if the user cancels, a failure response is sent with `error: 'User cancelled'`.

### AC-8: `GET_PUSH_TOKEN` handler implemented

**Given** a `GET_PUSH_TOKEN` message,
**When** the handler runs,
**Then** the handler reads the FCM token from a shared module-level variable (set by Story 3.4 after permission grant).
**And** responds with `{ success: true, data: tokenString }` or `{ success: true, data: null }` if no token available.

### AC-9: `GET_CONNECTIVITY` handler implemented

**Given** a `GET_CONNECTIVITY` message,
**When** the handler runs,
**Then** `NetInfo.fetch()` is called and the result's `isConnected` boolean is returned:
```javascript
{ success: true, data: true } // or false
```

### AC-10: `NAVIGATE` handler implemented

**Given** a `NAVIGATE` message with `payload: { path: string }`,
**When** the handler runs,
**Then** the WebView navigates to `Config.TENANT_WEBVIEW_URL + payload.path`.
**And** this is implemented by injecting `window.location.href = url` or using `webViewRef.current.injectJavaScript` to navigate client-side.
**And** no response message is sent (NAVIGATE is fire-and-forget from the web side).

### AC-11: WebView `ref` exposed for injection

**Given** the `MainScreen` component,
**When** rendering the WebView,
**Then** a `useRef` is used to hold the WebView reference so that `injectJavaScript` can be called from message handlers.

### AC-12: Loading indicator during initial WebView load

**Given** the WebView is loading for the first time,
**When** `onLoadStart` fires and before `onLoadEnd` fires,
**Then** a native `ActivityIndicator` is shown centered on screen.
**And** the indicator is dismissed on `onLoadEnd`.

### AC-13: `pnpm type-check` passes

**Given** all new TypeScript files in `apps/mobile`,
**When** `pnpm --filter @flowtiq/mobile type-check` runs,
**Then** zero TypeScript errors.

---

## Implementation Notes

### Additional packages needed (not in Story 3.1 list — add here)

```bash
pnpm add react-native-document-picker react-native-image-picker --filter @flowtiq/mobile
```

Update iOS pods after adding.

### File structure

- `apps/mobile/src/screens/MainScreen.tsx` — main WebView screen
- `apps/mobile/src/lib/NativeBridge.web.js` — the injected JS string (plain JS file, not TS)
- `apps/mobile/src/lib/bridgeHandlers.ts` — handler functions per message type
- `apps/mobile/src/lib/pushToken.ts` — module-level FCM token storage (shared with Story 3.4)

### Base64 conversion for files

```typescript
import RNFS from 'react-native-fs'; // add if needed

// For DocumentPicker result:
const base64 = await RNFS.readFile(result.uri, 'base64');
```

Alternative: use the `base64` property if available from the picker directly.

### Injected JS template

The injected script must be a string with `Platform.OS` interpolated at component render time:

```typescript
const injectedScript = `
  (function() {
    window.NativeBridge = {
      platform: '${Platform.OS}',
      postMessage: function(message) {
        window.ReactNativeWebView.postMessage(message);
      }
    };
  })();
  true;
`;
```

---

## Out of Scope

- Auth token injection (Story 3.3)
- Push token management (Story 3.4)
- Deep link routing (Story 3.5)
- Offline overlay (Story 3.6)
- Navigation chrome (Story 3.7)
- `REQUEST_PERMISSION` bridge type (out of scope for Phase 2 — silently ignore)

---

## Definition of Done

- [ ] `MainScreen.tsx` created with WebView loading `TENANT_WEBVIEW_URL`
- [ ] WebView security props set (originWhitelist, file access disabled)
- [ ] `window.NativeBridge` injected before content loads
- [ ] `onMessage` handler parses JSON, dispatches by type
- [ ] Unknown types silently ignored
- [ ] All 5 message types handled: FILE_PICK, CAMERA_CAPTURE, GET_PUSH_TOKEN, GET_CONNECTIVITY, NAVIGATE
- [ ] Responses dispatched via `injectJavaScript` CustomEvent
- [ ] Loading indicator on initial load
- [ ] `pnpm type-check` passes
