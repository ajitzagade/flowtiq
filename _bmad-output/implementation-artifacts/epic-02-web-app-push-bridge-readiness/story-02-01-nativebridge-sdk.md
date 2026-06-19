---
epicId: 2
storyId: '02-01'
title: 'NativeBridge SDK (Web Side)'
status: ready
priority: high
estimate: 3
---

# Story 2.1 — NativeBridge SDK (Web Side)

## Story

**As a** web app running inside the React Native shell,
**I want** a typed client SDK to communicate with the native layer,
**so that** any component can delegate device operations (file pick, camera, push token, connectivity) to the native shell without directly coupling to the bridge messaging protocol.

---

## Context

The NativeBridge is the bidirectional communication channel between the Next.js web app (running in a WebView) and the React Native native shell. The native shell injects `window.NativeBridge` into the WebView before the page loads. The web side posts typed messages and listens for responses via custom DOM events.

This story creates the web-side SDK only — the native shell handler is created in Epic 3 (Story 3.2). For now, the SDK must work defensively: if `window.NativeBridge` is absent (running in a browser), all operations fall back gracefully.

---

## Acceptance Criteria

### AC-1: `nativeBridge.ts` library file created

**Given** the path `apps/admin-portal/src/lib/nativeBridge.ts`,
**When** the file is created,
**Then** it exports the following functions:
- `isNativeApp(): boolean`
- `requestFilePick(options?: FilePickOptions): Promise<File[]>`
- `requestCameraCapture(): Promise<File>`
- `getPushToken(): Promise<string | null>`
- `getConnectivity(): Promise<boolean>`
- `navigateTo(path: string): void`
- `getPlatform(): 'ios' | 'android' | null`

### AC-2: `isNativeApp()` detects the native shell correctly

**Given** the function is called in a browser (no native shell),
**When** `window.NativeBridge` is undefined,
**Then** `isNativeApp()` returns `false`.

**Given** the function is called inside the native WebView (shell has injected `window.NativeBridge`),
**When** `window.NativeBridge` is a defined object,
**Then** `isNativeApp()` returns `true`.

### AC-3: Message protocol — request/response via events

**Given** any bridge function is called,
**When** the function sends a message,
**Then** it calls `window.NativeBridge.postMessage(JSON.stringify({ type, requestId, payload }))` where `requestId` is a unique string (use `crypto.randomUUID()`).

**And** the function returns a `Promise` that resolves when a `CustomEvent` named `'nativeBridgeResponse'` fires on `window` with `event.detail.requestId` matching the original `requestId`.

**And** the Promise resolves with `event.detail.data` on success, or rejects with `event.detail.error` if `event.detail.success === false`.

### AC-4: 15-second timeout per request

**Given** a bridge request is sent and no response event fires,
**When** 15 seconds elapse,
**Then** the Promise rejects with `new Error('NativeBridge timeout: ${type}')`.
**And** the event listener is cleaned up on timeout (no memory leak).

### AC-5: `requestFilePick` message type and return type

**Given** `requestFilePick()` is called,
**When** the native shell responds with selected file data,
**Then** the message sent has `type: 'FILE_PICK'` and `payload: { multiple: boolean, accept?: string }`.
**And** the function resolves with an array of `File` objects reconstructed from the native response (base64 + mimeType + filename).

### AC-6: `requestCameraCapture` message type and return type

**Given** `requestCameraCapture()` is called,
**When** the native shell responds with a captured image,
**Then** the message sent has `type: 'CAMERA_CAPTURE'`.
**And** the function resolves with a single `File` object reconstructed from the native response (base64 + mimeType + filename).

### AC-7: `getPushToken` message type and return type

**Given** `getPushToken()` is called,
**When** the native shell responds,
**Then** the message sent has `type: 'GET_PUSH_TOKEN'`.
**And** the function resolves with the FCM token string, or `null` if the user has not granted notification permission.

### AC-8: `getConnectivity` message type and return type

**Given** `getConnectivity()` is called,
**When** the native shell responds,
**Then** the message sent has `type: 'GET_CONNECTIVITY'`.
**And** the function resolves with `true` if connected, `false` if offline.

### AC-9: `navigateTo` is fire-and-forget

**Given** `navigateTo('/projects/abc')` is called,
**When** running in native app,
**Then** the message `{ type: 'NAVIGATE', payload: { path: '/projects/abc' } }` is posted immediately with no response expected and no Promise returned.
**And** when NOT in native app, `navigateTo` is a no-op.

### AC-10: `getPlatform` reads a synchronous property

**Given** the native shell sets `window.NativeBridge.platform = 'ios'` or `'android'` at injection time,
**When** `getPlatform()` is called,
**Then** it returns `window.NativeBridge.platform` cast to `'ios' | 'android'`, or `null` if not in native app.

### AC-11: Graceful fallback when not in native app

**Given** `isNativeApp()` returns `false`,
**When** any bridge function is called,
**Then** `requestFilePick` rejects immediately with `new Error('Not in native app')`.
**And** `requestCameraCapture` rejects immediately.
**And** `getPushToken` resolves with `null`.
**And** `getConnectivity` resolves with `true` (assume online in browser).
**And** `navigateTo` is a no-op.
**And** `getPlatform` returns `null`.

### AC-12: TypeScript Window interface declaration

**Given** the SDK references `window.NativeBridge`,
**When** TypeScript compiles the project,
**Then** a declaration exists (either inline in the file or in a `.d.ts` file) that extends the global `Window` interface:

```typescript
interface Window {
  NativeBridge?: {
    postMessage: (message: string) => void;
    platform?: 'ios' | 'android';
  };
}
```

**And** `pnpm type-check` passes with zero errors.

---

## Implementation Notes

### File location
`apps/admin-portal/src/lib/nativeBridge.ts`

### Message envelope type

```typescript
interface BridgeMessage {
  type: 'FILE_PICK' | 'CAMERA_CAPTURE' | 'GET_PUSH_TOKEN' | 'GET_CONNECTIVITY' | 'REQUEST_PERMISSION' | 'NAVIGATE';
  requestId: string;
  payload?: Record<string, unknown>;
}

interface BridgeResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### File reconstruction from native response

The native shell returns file data as:
```typescript
{ base64: string, mimeType: string, filename: string }
```

Reconstruct as `File`:
```typescript
function base64ToFile(base64: string, mimeType: string, filename: string): File {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new File([ab], filename, { type: mimeType });
}
```

### Request helper pattern

```typescript
function sendBridgeRequest<T>(type: BridgeMessage['type'], payload?: Record<string, unknown>): Promise<T> {
  if (!isNativeApp()) {
    return Promise.reject(new Error('Not in native app'));
  }
  const requestId = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('nativeBridgeResponse', handler);
      reject(new Error(`NativeBridge timeout: ${type}`));
    }, 15000);

    const handler = (event: Event) => {
      const e = event as CustomEvent<BridgeResponse>;
      if (e.detail.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('nativeBridgeResponse', handler);
      if (e.detail.success) resolve(e.detail.data as T);
      else reject(new Error(e.detail.error));
    };

    window.addEventListener('nativeBridgeResponse', handler);
    window.NativeBridge!.postMessage(JSON.stringify({ type, requestId, payload }));
  });
}
```

### FilePickOptions type

```typescript
export interface FilePickOptions {
  multiple?: boolean;
  accept?: string; // e.g. 'image/*', 'application/pdf'
}
```

---

## Out of Scope

- The native shell handler (created in Epic 3, Story 3.2)
- `REQUEST_PERMISSION` bridge operation (implemented in Epic 3, Story 3.4)
- Integration with specific upload components (Story 2.3)
- Push token registration flow (Story 2.4)

---

## Definition of Done

- [ ] `apps/admin-portal/src/lib/nativeBridge.ts` created
- [ ] All 7 exported functions implemented
- [ ] `Window` interface extended for TypeScript
- [ ] Graceful fallbacks when not in native app
- [ ] 15-second timeout with cleanup on all async requests
- [ ] `pnpm type-check` passes
- [ ] Manual test in browser: `isNativeApp()` returns false, `getPushToken()` resolves null
