---
epicId: 3
storyId: '03-05'
title: 'Deep Linking'
status: review
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
priority: high
estimate: 3
dependencies:
  - '03-02'
---

# Story 3.5 — Deep Linking

## Story

**As a** mobile app user,
**I want** tapping a push notification or an external link to open the app and navigate directly to the relevant screen,
**so that** I can act on notifications without manually finding the right page.

---

## Context

Deep linking works via Universal Links (iOS) and App Links (Android). When a user taps a link to the tenant Vercel domain on their device, the OS intercepts it and opens the Flowtiq app (if installed), navigating to the relevant path within the WebView.

Push notification deep links are relative paths (e.g. `/projects/abc`) embedded in the FCM message's `data.deepLinkUrl` field. The native shell combines these with `TENANT_WEBVIEW_URL` to navigate the WebView.

Depends on Story 3.2 (WebView and `webViewRef` must exist).

---

## Acceptance Criteria

### AC-1: iOS — Universal Links configured in native project

**Given** the iOS native project at `apps/mobile/ios/`,
**When** this story is complete,
**Then** `apps/mobile/ios/FlowtiqMobile/FlowtiqMobile.entitlements` (or equivalent entitlements file) contains:
```xml
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:$(TENANT_DOMAIN)</string>
</array>
```

**And** `apps/mobile/README.md` documents that `TENANT_DOMAIN` must be set to the tenant's Vercel domain (e.g. `flowtiq-admin.vercel.app` for Vastudeep).
**And** the entitlements file uses a build variable so it can be overridden per tenant in Epic 4.

### AC-2: iOS — `apple-app-site-association` file content documented

**Given** Universal Links require a verification file on the domain,
**When** this story is complete,
**Then** `apps/mobile/docs/apple-app-site-association.json` contains the template:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.BUNDLE_ID",
        "paths": ["*"]
      }
    ]
  }
}
```

**And** `apps/mobile/README.md` documents that this file must be deployed to the tenant's Vercel domain at `/.well-known/apple-app-site-association` with the correct `appID` filled in.
**And** the Next.js admin portal's `public/` directory needs a `.well-known/apple-app-site-association` file added (document this as a web app deployment step; the actual file addition is part of Epic 4 / Story 4.4).

### AC-3: Android — App Links configured in `AndroidManifest.xml`

**Given** `apps/mobile/android/app/src/main/AndroidManifest.xml`,
**When** this story is complete,
**Then** the main activity's `<intent-filter>` includes:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="${TENANT_DOMAIN}" />
</intent-filter>
```

**And** `${TENANT_DOMAIN}` is replaced with the actual Vastudeep domain as a build variable (or hardcoded as `flowtiq-admin.vercel.app` for the reference build with a TODO comment for Epic 4).

### AC-4: Android — `assetlinks.json` content documented

**Given** Android App Links require verification,
**When** this story is complete,
**Then** `apps/mobile/docs/assetlinks.json` contains the template:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "BUNDLE_ID",
    "sha256_cert_fingerprints": ["SIGNING_CERT_SHA256"]
  }
}]
```

**And** README documents that this must be deployed to the tenant domain at `/.well-known/assetlinks.json`.

### AC-5: `Linking.getInitialURL()` handled on cold start

**Given** the app is launched from a tapped link or notification,
**When** `MainScreen` mounts,
**Then** `Linking.getInitialURL()` is called in a `useEffect`.
**And** if the URL is non-null and matches the tenant domain, the path is extracted and the WebView is navigated to it after `onLoadEnd`.

### AC-6: `Linking.addEventListener` handles links while app is running

**Given** the app is already open and a Universal/App Link is invoked,
**When** the `url` event fires on `Linking`,
**Then** the path is extracted from the URL and the WebView navigates to it immediately.
**And** the event listener is cleaned up in the `useEffect` cleanup function.

### AC-7: Path extraction from full URL

**Given** a full URL such as `https://flowtiq-admin.vercel.app/projects/abc123`,
**When** it is received via `Linking`,
**Then** the path `/projects/abc123` is extracted (strip the origin).
**And** the WebView navigates to `Config.TENANT_WEBVIEW_URL + '/projects/abc123'`.

### AC-8: Push notification deep link routing

**Given** a push notification with `data.deepLinkUrl = '/projects/abc123'` is tapped (foreground, background, or quit state),
**When** the app handles the tap,
**Then** the WebView navigates to `Config.TENANT_WEBVIEW_URL + data.deepLinkUrl`.
**And** this is the same navigation mechanism used for Universal/App Links (same helper function).

Note: Foreground tap routing is handled in Story 3.4 (Notifee). Quit-state is also in Story 3.4 (`getInitialNotification`). This story ensures the `navigateWebView(path)` helper is a shared utility used by both.

### AC-9: Navigation utility function created

**Given** the need to navigate the WebView from multiple places (deep links, push taps, NAVIGATE bridge),
**When** this story is complete,
**Then** `apps/mobile/src/lib/webViewNavigation.ts` exports:
```typescript
export function navigateWebView(path: string): void {
  const url = Config.TENANT_WEBVIEW_URL + path;
  webViewRef.current?.injectJavaScript(`window.location.href = '${url}'; true;`);
}
```

**And** the `NAVIGATE` bridge handler (Story 3.2) is updated to use this utility.
**And** Story 3.4's push tap handlers use this utility.

### AC-10: All 16 web app paths navigable

**Given** all 16 admin portal pages,
**When** a deep link targets any of their paths,
**Then** the WebView navigates correctly and the page loads.
**And** no path is blocked or filtered (any path under the tenant domain is accepted).

---

## Implementation Notes

### Path extraction utility

```typescript
function extractPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return url; // fallback if already a path
  }
}
```

### useEffect in MainScreen

```typescript
useEffect(() => {
  // Cold start deep link
  Linking.getInitialURL().then((url) => {
    if (url) navigateWebView(extractPath(url));
  });

  // App already open
  const subscription = Linking.addEventListener('url', ({ url }) => {
    navigateWebView(extractPath(url));
  });

  return () => subscription.remove();
}, []);
```

### Vercel deployment step (document, do not implement)

The `apple-app-site-association` and `assetlinks.json` files must be served at the correct paths from the Vercel deployment. For the Next.js app, this means adding them to `apps/admin-portal/public/.well-known/`. Document this as a prerequisite for the Vastudeep production deployment in Epic 4, Story 4.4.

---

## Out of Scope

- Custom URL scheme (`flowtiq://`) — Universal/App Links only (HTTPS)
- Branch.io or other deep link attribution SDKs
- Deep link analytics
- Path filtering or access control at the deep link level (RBAC is handled by the web app)

---

## Definition of Done

- [ ] iOS entitlements file updated with `applinks` domain
- [ ] Android `AndroidManifest.xml` intent filter added
- [ ] `apple-app-site-association` template in `docs/`
- [ ] `assetlinks.json` template in `docs/`
- [ ] `apps/mobile/src/lib/webViewNavigation.ts` utility created
- [ ] `Linking.getInitialURL()` handled in `MainScreen` useEffect
- [ ] `Linking.addEventListener` registered and cleaned up
- [ ] NAVIGATE bridge handler updated to use shared utility
- [ ] README documents Vercel deployment step for `.well-known` files
- [ ] `pnpm type-check` passes
