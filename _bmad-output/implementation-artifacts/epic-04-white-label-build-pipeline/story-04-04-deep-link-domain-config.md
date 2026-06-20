---
epicId: 4
storyId: '04-04'
title: 'Deep Link Domain Config'
status: review
priority: high
estimate: 2
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
dependencies:
  - '03-05'
  - '04-01'
---

# Story 4.4 — Deep Link Domain Config

## Story

**As a** Vastudeep Associates user,
**I want** links to the Flowtiq platform to open the native app directly,
**so that** I can tap a push notification or a shared link and land on the right screen immediately.

---

## Context

Universal Links (iOS) and App Links (Android) require a verified domain association: the app declares which domain it handles, and the domain serves a verification file (`apple-app-site-association` for iOS, `assetlinks.json` for Android) that confirms the association. This story deploys those verification files to the Vastudeep Vercel deployment and configures the native app to match.

Story 3.5 created placeholder templates. This story fills them in with Vastudeep-specific values and deploys them.

Depends on Story 3.5 (native deep link config must exist) and Story 4.1 (bundle IDs confirmed).

---

## Acceptance Criteria

### AC-1: `apple-app-site-association` deployed to Vercel

**Given** `apps/admin-portal/public/.well-known/apple-app-site-association`,
**When** this story is complete,
**Then** the file exists with Vastudeep-specific values:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "VASTUDEEP_TEAM_ID.com.vastudeep.flowtiq",
        "paths": ["*"]
      }
    ]
  }
}
```

**And** `VASTUDEEP_TEAM_ID` is replaced with the actual Apple Team ID from `configs/build/tenant-configs/vastudeep.json`.

### AC-2: `assetlinks.json` deployed to Vercel

**Given** `apps/admin-portal/public/.well-known/assetlinks.json`,
**When** this story is complete,
**Then** the file exists:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.vastudeep.flowtiq",
    "sha256_cert_fingerprints": ["VASTUDEEP_SHA256_FINGERPRINT"]
  }
}]
```

**And** `VASTUDEEP_SHA256_FINGERPRINT` is the SHA-256 fingerprint of the Android signing keystore (from Story 4.2).

### AC-3: `.well-known` files served with correct Content-Type

**Given** the Next.js admin portal served via Vercel,
**When** `https://flowtiq-admin.vercel.app/.well-known/apple-app-site-association` is requested,
**Then** the response Content-Type is `application/json` (not `text/plain`).

**And** the file is accessible without authentication (publicly reachable by Apple's and Google's verification crawlers).

**And** this is achieved by adding headers in `apps/admin-portal/vercel.json` (create if not present) or `next.config.js`:
```json
{
  "headers": [
    {
      "source": "/.well-known/:path*",
      "headers": [
        { "key": "Content-Type", "value": "application/json" },
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    }
  ]
}
```

### AC-4: iOS entitlements updated with Vastudeep domain

**Given** `apps/mobile/ios/FlowtiqMobile/FlowtiqMobile.entitlements`,
**When** updated,
**Then** it contains:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.associated-domains</key>
  <array>
    <string>applinks:flowtiq-admin.vercel.app</string>
  </array>
</dict>
</plist>
```

**And** the entitlements file is referenced in the Xcode project build settings.

### AC-5: Android manifest updated with Vastudeep domain

**Given** `apps/mobile/android/app/src/main/AndroidManifest.xml`,
**When** updated,
**Then** the main activity includes an intent filter:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="flowtiq-admin.vercel.app" />
</intent-filter>
```

### AC-6: Verification files confirmed accessible

**Given** the Vercel deployment with the `.well-known` files,
**When** the files are deployed (after a push to main or manual deploy),
**Then** the following curl commands return HTTP 200 with valid JSON:
```bash
curl https://flowtiq-admin.vercel.app/.well-known/apple-app-site-association
curl https://flowtiq-admin.vercel.app/.well-known/assetlinks.json
```

**And** this is verified manually and the result documented in `apps/mobile/README.md`.

### AC-7: SHA-256 fingerprint extraction documented

**Given** the Android keystore from Story 4.2,
**When** the developer needs the SHA-256 fingerprint,
**Then** `apps/mobile/README.md` documents the command:
```bash
keytool -list -v -keystore release.keystore -alias flowtiq -storepass YOUR_STORE_PASSWORD
```

**And** the fingerprint value to use is the `SHA256:` line from the output, formatted without colons for the `assetlinks.json`.

### AC-8: `apply-tenant-config.js` extended to update `.well-known` files (optional)

**Given** the config script from Story 4.1,
**When** a new tenant is onboarded,
**Then** `scripts/apply-tenant-config.js` also updates `apps/admin-portal/public/.well-known/apple-app-site-association` and `assetlinks.json` with the tenant's team ID, bundle ID, and certificate fingerprint (if these are added to the tenant JSON config).

Note: This is optional for this story if the manual approach is sufficient for Phase 2. Document the manual steps clearly as the minimum viable approach.

---

## Implementation Notes

### Vercel Content-Type for `.well-known`

Next.js serves files from `public/` as static assets. By default, `.well-known/apple-app-site-association` (no extension) may be served as `application/octet-stream`. The headers config in `vercel.json` overrides this.

If `vercel.json` already exists in `apps/admin-portal/`, update it rather than creating a new one. Read it first.

### iOS entitlements — Xcode project link

Ensure the entitlements file is referenced in `project.pbxproj` under the target's build settings (`CODE_SIGN_ENTITLEMENTS`). If `FlowtiqMobile.entitlements` was created in Story 3.5, verify the Xcode project references it; if not, add it via Xcode GUI or edit the `.pbxproj` directly.

### Testing Universal Links (iOS)

Universal Links can only be tested on a physical device (not simulator). Steps:
1. Install the app on device
2. Open Safari and navigate to `https://flowtiq-admin.vercel.app/projects`
3. The OS should offer to open in the app (or open directly)

Document this in `apps/mobile/README.md`.

---

## Out of Scope

- Custom domain for Vercel (using the default `flowtiq-admin.vercel.app` for Phase 2)
- Multi-tenant `.well-known` routing (one set of files per deployment; future tenants get their own Vercel deployment)
- Deep link analytics

---

## Definition of Done

- [x] `apps/admin-portal/public/.well-known/apple-app-site-association` with Vastudeep bundle ID (team ID placeholder — replace with real value in Story 4.6)
- [x] `apps/admin-portal/public/.well-known/assetlinks.json` with Vastudeep package name (SHA-256 placeholder — replace after keystore generated in Story 4.6)
- [x] `vercel.json` headers set for `.well-known` files (Content-Type: application/json, Cache-Control: no-cache)
- [x] iOS entitlements file updated with `flowtiq-admin.vercel.app` (replaced `$(TENANT_DOMAIN)` placeholder)
- [x] Android manifest intent filter already correct for `flowtiq-admin.vercel.app` (set in Story 3.5)
- [ ] Both `.well-known` URLs return HTTP 200 with JSON content type (verified after Vercel deploy — Story 4.6)
- [x] README: SHA-256 extraction command, manual verification steps, Universal Links testing instructions

## Dev Agent Record

### Implementation Notes
- Created `apps/admin-portal/public/.well-known/apple-app-site-association` with `PLACEHOLDER_APPLE_TEAM_ID.com.vastudeep.flowtiq`
- Created `apps/admin-portal/public/.well-known/assetlinks.json` with `com.vastudeep.flowtiq` package name and `PLACEHOLDER_SHA256_FINGERPRINT`
- Updated `apps/admin-portal/vercel.json` to add headers block for `/.well-known/:path*` — ensures correct Content-Type for Apple/Google crawlers
- Updated `apps/mobile/ios/FlowtiqMobile/FlowtiqMobile.entitlements` — replaced `applinks:$(TENANT_DOMAIN)` with `applinks:flowtiq-admin.vercel.app`
- Android `AndroidManifest.xml` intent-filter was already correct (set in Story 3.5) — no changes needed
- README documents SHA-256 extraction, both `.well-known` verification curl commands, and Universal Links testing on physical device

### Change Log
- 2026-06-20: Implemented Story 4.4 — Deep Link Domain Config
