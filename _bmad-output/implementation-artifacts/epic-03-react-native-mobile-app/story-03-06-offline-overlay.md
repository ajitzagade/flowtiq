---
epicId: 3
storyId: '03-06'
title: 'Offline Overlay'
status: review
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
priority: medium
estimate: 2
dependencies:
  - '03-02'
---

# Story 3.6 — Offline Overlay

## Story

**As a** mobile app user on a weak or absent connection,
**I want** to see a clear offline indicator rather than a broken WebView,
**so that** I know why content isn't loading and can retry when connectivity is restored.

---

## Context

When the device has no network connectivity, the WebView will fail to load or show a browser error page. Instead, a full-screen native overlay is displayed above the WebView, informing the user they are offline. The overlay auto-dismisses when connectivity is restored. The WebView is NOT unmounted during offline periods (preserving any loaded state).

Depends on Story 3.2 (WebView must exist in `MainScreen`).

---

## Acceptance Criteria

### AC-1: Connectivity monitored via NetInfo

**Given** `@react-native-community/netinfo` installed (Story 3.1),
**When** `MainScreen` mounts,
**Then** `NetInfo.addEventListener` is registered to listen for connectivity changes.
**And** the listener is removed in the `useEffect` cleanup.

### AC-2: Offline overlay displayed when disconnected

**Given** `NetInfo` reports `isConnected: false` or `isInternetReachable: false`,
**When** this state is detected,
**Then** a full-screen `OfflineOverlay` component is displayed on top of the WebView.
**And** the WebView remains mounted beneath it (not unmounted or re-navigated).

### AC-3: Overlay content

**Given** the `OfflineOverlay` component renders,
**When** the user is offline,
**Then** the overlay displays:
- A wifi-off or no-internet icon (use a simple React Native `Text` unicode character or a bundled SVG — keep it simple)
- Heading text: `"No Internet Connection"`
- Subtext: `"Please check your connection and try again."`
- A "Retry" button

**And** the overlay has a solid background color (white or the app's background color) so it fully covers the WebView.

### AC-4: Retry button re-checks connectivity

**Given** the user taps the "Retry" button,
**When** the button is pressed,
**Then** `NetInfo.fetch()` is called to get the current connectivity state.
**And** if `isConnected: true`: the overlay is dismissed and the WebView is reloaded (`webViewRef.current?.reload()`).
**And** if still disconnected: the overlay remains visible (no change).

### AC-5: Overlay auto-dismisses on connectivity restore

**Given** the device regains connectivity,
**When** the `NetInfo` listener fires with `isConnected: true`,
**Then** the overlay is automatically dismissed without user action.
**And** the WebView is reloaded to fetch the latest content.

### AC-6: Initial connectivity check on mount

**Given** `MainScreen` mounts,
**When** the component initializes,
**Then** the initial connectivity state is checked via `NetInfo.fetch()` before the WebView loads.
**And** if already offline at mount time, the overlay is shown immediately.

### AC-7: WebView not remounted

**Given** the user goes offline and then comes back online,
**When** the overlay is dismissed,
**Then** the WebView component is the same instance (not remounted).
**And** any web app state that was loaded before going offline is preserved.

### AC-8: OfflineOverlay is a separate component

**Given** the overlay logic,
**When** implemented,
**Then** the overlay is a separate component in `apps/mobile/src/components/OfflineOverlay.tsx`.
**And** `MainScreen` uses `useState<boolean>` to control whether the overlay is shown.

### AC-9: `pnpm type-check` passes

**Given** all new TypeScript,
**When** type-check runs,
**Then** zero errors.

---

## Implementation Notes

### NetInfo listener pattern

```typescript
useEffect(() => {
  // Initial check
  NetInfo.fetch().then((state) => {
    setIsOffline(!state.isConnected || !state.isInternetReachable);
  });

  // Subscribe to changes
  const unsubscribe = NetInfo.addEventListener((state) => {
    const offline = !state.isConnected || !state.isInternetReachable;
    setIsOffline(offline);
    if (!offline) {
      webViewRef.current?.reload();
    }
  });

  return () => unsubscribe();
}, []);
```

### OfflineOverlay component

```tsx
// apps/mobile/src/components/OfflineOverlay.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onRetry: () => void;
}

export function OfflineOverlay({ onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚡</Text>
      <Text style={styles.heading}>No Internet Connection</Text>
      <Text style={styles.subtext}>Please check your connection and try again.</Text>
      <TouchableOpacity style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
  },
  // ... other styles
});
```

### MainScreen integration

```tsx
{isOffline && (
  <OfflineOverlay onRetry={() => {
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        setIsOffline(false);
        webViewRef.current?.reload();
      }
    });
  }} />
)}
```

### Note on `isInternetReachable`

On Android, `isInternetReachable` may be `null` in some network states. Treat `null` as uncertain (do not show offline overlay if `isConnected` is true but `isInternetReachable` is null — let the user see the WebView error rather than a false-positive offline state).

---

## Out of Scope

- Offline-first data caching (out of Phase 2 scope)
- Partial connectivity detection (e.g. captive portal)
- Custom offline illustration/asset (use text/unicode; per-tenant branded offline screen is not required)
- Syncing queued actions when back online

---

## Definition of Done

- [ ] `apps/mobile/src/components/OfflineOverlay.tsx` created
- [ ] NetInfo listener registered in `MainScreen` with cleanup
- [ ] Initial connectivity check on mount
- [ ] `isOffline` state controls overlay visibility
- [ ] Overlay shown with heading, subtext, retry button
- [ ] Retry button calls `NetInfo.fetch()` and reloads WebView if connected
- [ ] Auto-dismiss on connectivity restore + WebView reload
- [ ] WebView NOT unmounted during offline state
- [ ] `pnpm type-check` passes
