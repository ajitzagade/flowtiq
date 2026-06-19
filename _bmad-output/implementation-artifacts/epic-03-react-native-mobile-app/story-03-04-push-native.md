---
epicId: 3
storyId: '03-04'
title: 'Push Notifications (Native)'
status: review
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
priority: high
estimate: 5
dependencies:
  - '03-02'
  - '01-02'
---

# Story 3.4 — Push Notifications (Native)

## Story

**As a** mobile app user,
**I want** to receive push notifications when events happen in Flowtiq, see banners when the app is open, and navigate directly to the relevant screen when I tap a notification,
**so that** I stay informed and can take immediate action without manually checking the app.

---

## Context

This story implements the complete native push notification flow: permission request, FCM token acquisition, foreground banner display (Notifee), background handling, and quit-state tap routing. The FCM token stored in a module-level variable (`apps/mobile/src/lib/pushToken.ts`) is what the `GET_PUSH_TOKEN` bridge handler (Story 3.2) reads.

The backend (Epic 1) sends FCM messages; this story handles receiving them.

Firebase credentials (`google-services.json`, `GoogleService-Info.plist`) are tenant-specific and added in Epic 4. For this story, placeholder files must be in place to allow the build to compile.

Depends on Story 3.2 (bridge handler for `GET_PUSH_TOKEN`).

---

## Acceptance Criteria

### AC-1: Firebase Messaging initialized

**Given** `@react-native-firebase/app` and `@react-native-firebase/messaging` installed (Story 3.1),
**When** the app starts,
**Then** Firebase is initialized via the native `google-services.json` / `GoogleService-Info.plist` (placeholder files for this story).
**And** `messaging()` is accessible without errors.

### AC-2: One-time permission request on first launch after login

**Given** a user who just logged in for the first time on this device,
**When** the push permission has not been requested before (AsyncStorage key `push_permission_requested` is not set),
**Then** an informational alert is shown BEFORE the system permission prompt:
- Title: `"Stay Updated"`
- Message: `"Enable notifications to receive alerts for assignments, stage updates, and reminders."`
- Buttons: "Enable Notifications", "Not Now"

**And** if the user selects "Enable Notifications": `messaging().requestPermission()` is called.
**And** after the system prompt (either granted or denied), `push_permission_requested` is set in AsyncStorage to `'true'`.

### AC-3: Permission state stored; no re-prompt from app launch

**Given** the permission prompt has been shown once (AsyncStorage key set),
**When** the app is subsequently launched,
**Then** no permission prompt or alert is shown automatically.
**And** re-prompt is only possible from the Settings page (web Settings page will navigate to device settings — no native UI needed for Phase 2).

### AC-4: FCM token retrieved and stored on permission grant

**Given** the user grants notification permission,
**When** `messaging().requestPermission()` resolves with authorized status,
**Then** `messaging().getToken()` is called.
**And** the token string is stored in the `pushToken` module (`apps/mobile/src/lib/pushToken.ts`) in a module-level variable:
```typescript
let _fcmToken: string | null = null;
export const setPushToken = (token: string | null) => { _fcmToken = token; };
export const getPushTokenValue = () => _fcmToken;
```

**And** the `GET_PUSH_TOKEN` bridge handler (Story 3.2) calls `getPushTokenValue()` to return this token to the web app.
**And** the web app then registers the token via `POST /api/users/device-token` (Story 2.4).

### AC-5: Token refresh handler registered

**Given** the app is running and FCM rotates the token,
**When** `messaging().onTokenRefresh(newToken)` fires,
**Then** `setPushToken(newToken)` is called to update the module variable.
**And** the web app is notified via a bridge event so it can re-register the new token (inject a CustomEvent `fcmTokenRefresh` with the new token into the WebView).

### AC-6: Foreground notification displayed as in-app banner

**Given** the app is in the foreground and a push message arrives,
**When** `messaging().onMessage(remoteMessage)` fires,
**Then** `@notifee/react-native` is used to display an in-app notification banner:
```typescript
await notifee.displayNotification({
  title: remoteMessage.notification?.title,
  body: remoteMessage.notification?.body,
  android: { channelId: 'flowtiq-default', pressAction: { id: 'default' } },
});
```
**And** a default notification channel `flowtiq-default` is created on Android (with `notifee.createChannel`).

### AC-7: Foreground notification tap navigates WebView

**Given** the user taps a foreground Notifee banner,
**When** the `notifee.onForegroundEvent` fires with `type === EventType.PRESS`,
**Then** the `deepLinkUrl` from `remoteMessage.data` is used to navigate the WebView:
```typescript
webViewRef.current?.injectJavaScript(`window.location.href = '${deepLinkUrl}'; true;`);
```
**And** the navigation happens within the existing WebView (not a new screen).

### AC-8: Background message handler registered

**Given** the app is in the background or closed,
**When** a push notification arrives from FCM,
**Then** `messaging().setBackgroundMessageHandler(async (remoteMessage) => { ... })` handles the message.
**And** the handler is registered at the module level (outside any component, in the app entry point).
**And** the system tray notification is displayed by FCM automatically (no manual display needed for background messages).

### AC-9: Quit-state notification tap deep-links on launch

**Given** the app is completely closed and the user taps a notification in the system tray,
**When** the app launches,
**Then** `messaging().getInitialNotification()` is called in the app entry or `MainScreen` `useEffect`.
**And** if a notification is returned, its `data.deepLinkUrl` is used to navigate the WebView after it finishes loading (`onLoadEnd`).

### AC-10: Placeholder Firebase config files documented

**Given** no real `google-services.json` / `GoogleService-Info.plist` for Phase 2 development,
**When** a developer sets up the project,
**Then** `apps/mobile/README.md` documents exactly where to place these files and how to obtain them (from Firebase Console for the tenant's FCM project).
**And** placeholder stub files are in place to allow the build to compile (even if FCM does not work without real credentials).

### AC-11: `pnpm type-check` passes

**Given** all new TypeScript in `apps/mobile`,
**When** type-check runs,
**Then** zero errors.

---

## Implementation Notes

### Entry point registration

The background message handler MUST be registered in the app's entry file (`index.js` or `App.tsx`) before any component mounts. Add to `apps/mobile/index.js`:

```javascript
import messaging from '@react-native-firebase/messaging';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  // Background message received — system tray notification displayed automatically
  console.log('Background push:', remoteMessage);
});
```

### Notifee Android channel creation

Create the channel on app start (idempotent — safe to call every launch):

```typescript
import notifee, { AndroidImportance } from '@notifee/react-native';

await notifee.createChannel({
  id: 'flowtiq-default',
  name: 'Flowtiq Notifications',
  importance: AndroidImportance.HIGH,
});
```

### Permission check flow

```typescript
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERM_KEY = 'push_permission_requested';

async function requestPushPermissionIfNeeded() {
  const alreadyRequested = await AsyncStorage.getItem(PERM_KEY);
  if (alreadyRequested) return;

  // Show pre-prompt alert
  Alert.alert(
    'Stay Updated',
    'Enable notifications to receive alerts for assignments, stage updates, and reminders.',
    [
      { text: 'Not Now', style: 'cancel', onPress: () => AsyncStorage.setItem(PERM_KEY, 'true') },
      {
        text: 'Enable Notifications',
        onPress: async () => {
          await messaging().requestPermission();
          await AsyncStorage.setItem(PERM_KEY, 'true');
          const token = await messaging().getToken();
          if (token) setPushToken(token);
        },
      },
    ]
  );
}
```

Call `requestPushPermissionIfNeeded()` in `MainScreen` after detecting the user is logged in (e.g. after WebView loads and Keychain auth is injected).

### WebView ref for foreground tap navigation

The `webViewRef` from `MainScreen` needs to be accessible to the Notifee foreground event handler. Pass it as a prop or use a module-level ref. Keep it simple — a module-level ref is acceptable:

```typescript
// apps/mobile/src/lib/webViewRef.ts
import { createRef } from 'react';
import WebView from 'react-native-webview';
export const webViewRef = createRef<WebView>();
```

---

## Out of Scope

- Local notification scheduling
- Rich media notifications (images in notification)
- Notification grouping / threading
- Analytics for push open rates
- APNs direct integration (Firebase handles iOS delivery)

---

## Definition of Done

- [ ] `apps/mobile/src/lib/pushToken.ts` created with module-level token storage
- [ ] Background handler registered in entry point
- [ ] Permission request: pre-prompt alert + system prompt on first post-login launch
- [ ] `push_permission_requested` flag in AsyncStorage prevents re-prompt
- [ ] FCM token stored in module after permission grant
- [ ] `GET_PUSH_TOKEN` bridge handler returns stored token
- [ ] Token refresh: `onTokenRefresh` updates module variable + notifies WebView
- [ ] Foreground messages: Notifee banner displayed
- [ ] Foreground tap: WebView navigates to `deepLinkUrl`
- [ ] Quit-state: `getInitialNotification()` checked and WebView navigated on launch
- [ ] Android notification channel created
- [ ] README updated with Firebase config file instructions
- [ ] `pnpm type-check` passes
