---
epicId: 3
storyId: '03-07'
title: 'Native UI: Splash Screen + Navigation Chrome'
status: ready
priority: medium
estimate: 3
dependencies:
  - '03-02'
  - '03-03'
---

# Story 3.7 — Native UI: Splash Screen + Navigation Chrome

## Story

**As a** mobile app user,
**I want** to see a branded splash screen when the app opens and have a native navigation bar to quickly access key sections,
**so that** the app feels polished and platform-appropriate.

---

## Context

This story adds the two native UI elements visible to the user beyond the WebView: a splash screen (shown during cold start until the web app is ready) and a bottom navigation bar / tab bar (platform-specific navigation chrome). The navigation chrome is minimal — tabs navigate the WebView to different paths rather than loading separate native screens.

Depends on Story 3.2 (WebView and `onLoadEnd`) and Story 3.3 (auth injection must work before splash is dismissed).

---

## Acceptance Criteria

### AC-1: Splash screen displayed on cold start

**Given** the app is launched from a cold start,
**When** the native process starts,
**Then** a splash screen is immediately shown (before JavaScript executes).
**And** the splash screen displays a placeholder logo/image centered on the app's primary background color.
**And** the splash screen is implemented using `react-native-splash-screen` (or the React Native 0.71+ built-in splash screen API — use whichever matches the RN version chosen in Story 3.1).

### AC-2: Splash screen dismissed after WebView is interactive

**Given** the splash screen is showing,
**When** the WebView's `onLoadEnd` callback fires,
**Then** `SplashScreen.hide()` is called (or equivalent dismiss method).
**And** the splash screen fades out and the WebView content is visible.

### AC-3: Splash screen does not hide before auth injection completes

**Given** auth token injection (Story 3.3) runs in `injectedJavaScriptBeforeContentLoaded`,
**When** the WebView loads,
**Then** the splash screen remains visible until `onLoadEnd` fires (which means the full page has loaded with auth state injected).
**And** the user never sees a flash of the login page before the dashboard loads (if tokens exist).

### AC-4: Bottom tab bar on Android

**Given** the app runs on Android,
**When** the navigation is rendered,
**Then** a bottom navigation bar is displayed at the bottom of the screen using `@react-navigation/bottom-tabs`.
**And** the bar has at minimum these two tabs:
  - **Home** (house icon) — navigates WebView to `/` (dashboard)
  - **Notifications** (bell icon) — navigates WebView to `/notifications`

**And** tapping a tab navigates the WebView by calling `navigateWebView(path)` from the utility created in Story 3.5.
**And** the current active tab is highlighted based on the WebView's current URL (tracked via `onNavigationStateChange`).

### AC-5: Tab bar on iOS

**Given** the app runs on iOS,
**When** the navigation is rendered,
**Then** a tab bar is displayed at the bottom of the screen (iOS convention, also using `@react-navigation/bottom-tabs`).
**And** the same two tabs (Home, Notifications) are shown with the same behavior as Android.
**And** safe area insets are respected (tab bar sits above the home indicator).

### AC-6: Active tab state reflects WebView URL

**Given** the user navigates within the WebView (e.g. from the web app sidebar),
**When** `onNavigationStateChange` fires with the new URL,
**Then** the active tab indicator updates to match:
- If URL path starts with `/notifications`: Notifications tab is active
- Otherwise: Home tab is active

### AC-7: Navigation uses `navigateWebView` utility

**Given** a tab is tapped,
**When** the tab press handler runs,
**Then** `navigateWebView('/path')` from `apps/mobile/src/lib/webViewNavigation.ts` (Story 3.5) is called.
**And** the React Navigation navigator does NOT perform a native screen transition — the WebView handles all navigation internally.

### AC-8: Splash screen assets are placeholders

**Given** the splash screen image,
**When** this story is complete,
**Then** a placeholder image (simple white screen with "Flowtiq" text or a solid color) is used.
**And** `apps/mobile/README.md` documents where to replace splash assets per tenant (for Epic 4).

### AC-9: Safe area handled globally

**Given** notched iPhones and Android devices with gesture navigation bars,
**When** the app renders,
**Then** `SafeAreaProvider` wraps the root `App` component.
**And** `SafeAreaView` or `useSafeAreaInsets` is used in components that need inset awareness.
**And** the WebView respects safe area top inset (status bar area).

### AC-10: `pnpm type-check` passes

**Given** all new TypeScript,
**When** type-check runs,
**Then** zero errors.

---

## Implementation Notes

### App entry structure after this story

```
App.tsx
  SafeAreaProvider
    NavigationContainer
      Tab.Navigator (bottom-tabs)
        Tab.Screen "Home" → MainScreen
        Tab.Screen "Notifications" → MainScreen (same screen, different initial path)
```

Note: Both tabs render the same `MainScreen` (same WebView). The tab press navigates the WebView rather than switching screens. This keeps the WebView state intact across tab switches.

Alternative simpler approach: Use a single screen with the tab bar rendered as a custom component OUTSIDE React Navigation (just a View at the bottom). This avoids re-mounting the WebView on tab switch. Choose whichever is cleaner.

### react-native-splash-screen setup

```typescript
// In App.tsx or MainScreen useEffect (after onLoadEnd):
import SplashScreen from 'react-native-splash-screen';

// Call in MainScreen's onLoadEnd:
const handleLoadEnd = () => {
  SplashScreen.hide();
  setIsWebViewLoaded(true);
};
```

Native configuration (Obj-C / Java) is required per `react-native-splash-screen` docs. Follow the library setup guide for the chosen RN version.

### Tab icons

Use React Native's built-in text characters or add `react-native-vector-icons` for tab icons. If `react-native-vector-icons` is not already in the project, use Unicode characters (`🏠`, `🔔`) to keep dependencies minimal — or use simple SVG via `react-native-svg`. Do not add a large icon library just for two icons.

### WebView URL tracking

```typescript
const [activeTab, setActiveTab] = useState<'home' | 'notifications'>('home');

// In WebView:
onNavigationStateChange={(navState) => {
  if (navState.url.includes('/notifications')) {
    setActiveTab('notifications');
  } else {
    setActiveTab('home');
  }
}}
```

---

## Out of Scope

- More than 2 tabs (additional tabs can be added in future phases)
- Fully native screens for any tab (all content is WebView)
- Animated splash screen transitions
- Per-tenant splash screen branding (Epic 4)
- Drawer navigation or header navigation bar
- iOS header/navigation bar at top (suppress with `headerShown: false`)

---

## Definition of Done

- [ ] `react-native-splash-screen` (or built-in) configured for iOS and Android
- [ ] Splash screen shown on cold start, dismissed on `onLoadEnd`
- [ ] `SafeAreaProvider` wraps root component
- [ ] Bottom tab bar with Home and Notifications tabs
- [ ] Tab press calls `navigateWebView` (does not unmount WebView)
- [ ] Active tab updates based on WebView URL changes
- [ ] Placeholder splash assets with README documentation for replacement
- [ ] `pnpm type-check` passes
