---
epicId: 4
storyId: '04-06'
title: 'Vastudeep Reference Build + Store Submission'
status: ready
priority: high
estimate: 5
dependencies:
  - '04-01'
  - '04-02'
  - '04-03'
  - '04-04'
  - '04-05'
  - '03-04'
---

# Story 4.6 — Vastudeep Reference Build + Store Submission

## Story

**As a** Flowtiq engineer,
**I want** to complete and validate the entire Vastudeep Associates mobile app build from real credentials through to store submission,
**so that** we confirm the white-label pipeline works end-to-end before onboarding future tenants.

---

## Context

This is the final integration story for Phase 2. All prior stories deliver infrastructure; this story delivers the working product. It fills in all placeholder values in the Vastudeep config, adds real credentials, places branded assets, submits to both stores, and validates the complete push notification and deep link flow on a real device.

All 4 Epics must be complete for this story to succeed. This is the story that validates the PRD success metric: "Vastudeep Associates app live on both stores."

---

## Acceptance Criteria

### AC-1: FCM project created and credentials obtained

**Given** the Vastudeep Firebase project,
**When** set up (by a Flowtiq engineer with Firebase Console access),
**Then** the following credential files exist locally (never committed):
- `apps/mobile/android/app/google-services.json` — Android FCM config
- `apps/mobile/ios/GoogleService-Info.plist` — iOS FCM config

**And** `TenantPushCredentials` row is inserted in the production database for the Vastudeep tenant via a one-time SQL or Prisma script:
```sql
INSERT INTO tenant_push_credentials (id, "tenantId", "fcmProjectId", "fcmServerKey", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), '<vastudeep-tenant-id>', '<fcm-project-id>', '<fcm-server-key>', true, NOW(), NOW());
```

**And** the FCM project ID and server key are also stored as Railway environment variables for the API service.

### AC-2: Vastudeep tenant config fully populated

**Given** `configs/build/tenant-configs/vastudeep.json`,
**When** this story is complete,
**Then** all `PLACEHOLDER` values are replaced with real Vastudeep values:
- `primaryColor`: actual hex color from Vastudeep branding
- `secondaryColor`: actual hex color
- `fcmProjectId`: real Firebase project ID
- `iosTeamId`: real Apple Team ID
- `webviewUrl`: the production Vercel URL for Vastudeep

### AC-3: Branded assets placed for iOS

**Given** the Vastudeep brand assets (provided by the client or Flowtiq designer),
**When** placed in the correct locations,
**Then** the iOS project contains:
- App icons at all required sizes in `apps/mobile/ios/FlowtiqMobile/Images.xcassets/AppIcon.appiconset/`
- Splash screen image in `apps/mobile/ios/FlowtiqMobile/Images.xcassets/LaunchImage.imageset/` (or `LaunchScreen.storyboard` updated)
- `Contents.json` files updated for each image set

**And** the app name displayed on the home screen is "Vastudeep Flowtiq" (set via `apply-tenant-config.js`).

### AC-4: Branded assets placed for Android

**Given** the Vastudeep brand assets,
**When** placed in the correct locations,
**Then** the Android project contains:
- App icons in all density directories (`mipmap-mdpi` through `mipmap-xxxhdpi`)
- Adaptive icon foreground/background layers if targeting API 26+ (recommended)
- Splash screen drawable in `apps/mobile/android/app/src/main/res/drawable/`

**And** the app name displayed in the launcher is "Vastudeep Flowtiq".

### AC-5: `pnpm config:tenant vastudeep` applies all values correctly

**Given** the real `vastudeep.json` config,
**When** `pnpm config:tenant vastudeep` is run,
**Then** `apps/mobile/.env` contains the correct production Vercel URL.
**And** `build.gradle` applicationId is `com.vastudeep.flowtiq`.
**And** `Info.plist` bundle ID is `com.vastudeep.flowtiq` and display name is "Vastudeep Flowtiq".
**And** `strings.xml` app_name is "Vastudeep Flowtiq".

### AC-6: Android signed AAB submitted to Google Play internal track

**Given** all Android setup (Story 4.2) and the signing keystore,
**When** the release build runs (either locally or via CI),
**Then** a signed AAB is produced with:
- `applicationId: com.vastudeep.flowtiq`
- Correct app name: "Vastudeep Flowtiq"
- Vastudeep icons
- `minSdkVersion: 26`

**And** the AAB is uploaded to the Google Play internal track for the `com.vastudeep.flowtiq` app.
**And** a test device (with a Google account on the internal test track) can download and install the app.

### AC-7: iOS signed IPA submitted to TestFlight

**Given** all iOS setup (Story 4.3) and valid Fastlane match certificates,
**When** `fastlane beta` runs,
**Then** a signed IPA is produced with:
- Bundle ID: `com.vastudeep.flowtiq`
- Display name: "Vastudeep Flowtiq"
- Vastudeep icons and splash
- Deployment target: iOS 15.0

**And** the build appears in TestFlight within App Store Connect.
**And** an internal tester can install via TestFlight.

### AC-8: End-to-end smoke test on physical devices

**Given** the installed app on a real iOS and Android device,
**When** the full smoke test is run,
**Then** all of the following pass:

| Test | Expected Result |
|---|---|
| Cold start | Splash screen appears, dismissed within 3 seconds |
| Login | Login screen loads, credentials work |
| Dashboard | Dashboard loads after login, stat cards visible |
| Navigation | All sidebar links navigate correctly in WebView |
| Push notification | Create an assignment in web portal → push notification received on device within 30 seconds |
| Foreground banner | Open app, trigger notification → in-app banner appears |
| Notification tap | Tap notification → navigates to correct entity |
| Deep link | Tap link from Safari/Chrome to Vastudeep URL → app opens at correct path |
| File upload | Tap upload in app → native picker opens → file uploads successfully |
| Offline | Disable WiFi → offline overlay appears; re-enable → overlay dismisses |
| Logout | Logout → token cleared from Keychain, app shows login on next launch |

### AC-9: GitHub Actions pipeline tag triggers successful build

**Given** the CI/CD pipeline from Story 4.5,
**When** a Flowtiq engineer pushes the tag `mobile/vastudeep/v1.0.0`,
**Then** both `android-build` and `ios-build` jobs complete successfully.
**And** the AAB is submitted to Google Play internal track automatically.
**And** the IPA is uploaded to TestFlight automatically.
**And** the total pipeline duration is under 45 minutes.

### AC-10: Lessons learned documented in README

**Given** the completed reference build,
**When** `apps/mobile/README.md` is updated,
**Then** it documents:
- Any deviations from the planned setup that were discovered during the reference build
- Common issues and their solutions (e.g. pod install errors, signing issues)
- The exact steps taken to onboard Vastudeep (as a template for future tenants)
- How long each step took (approximate, for planning future onboarding)

### AC-11: `apple-app-site-association` verified in production

**Given** the deployed Vercel URL with `.well-known` files (Story 4.4),
**When** tested on a real iOS device,
**Then** tapping `https://flowtiq-admin.vercel.app/projects/some-id` in Safari opens the Vastudeep app at the projects page.
**And** the same test is passed for Android via Chrome.

---

## Implementation Notes

### Firebase FCM setup sequence

1. Create a new Firebase project (or reuse existing) for Vastudeep
2. Add Android app: package name `com.vastudeep.flowtiq`
3. Download `google-services.json` → place in `apps/mobile/android/app/`
4. Add iOS app: bundle ID `com.vastudeep.flowtiq`
5. Download `GoogleService-Info.plist` → place in `apps/mobile/ios/`
6. In Firebase Console → Project Settings → Cloud Messaging → get Server Key for the backend `TenantPushCredentials` record

### App icon generation

Use an online tool like [appicon.co](https://appicon.co) or the `react-native-make` CLI to generate all required icon sizes from a single 1024×1024 source PNG provided by the client.

### Verifying the production pipeline before tagging

Before pushing `v1.0.0`, run both builds locally (using local credentials) to catch any issues. Only push the release tag once local builds are verified.

### TestFlight internal vs external testing

For Phase 2, internal testing (App Store Connect team members) is sufficient. External TestFlight testing (requires Apple review) is not needed until production App Store submission.

### Google Play internal track

The internal track does not require a full Play Store review. Testers must be added via the Google Play Console → Testing → Internal Testing → manage testers.

---

## Out of Scope

- App Store production release (TestFlight → production promotion is a manual step post-Phase 2 QA)
- Play Store production release (internal track only for Phase 2)
- Client-facing App Store / Play Store listing copy finalization (covered by Vastudeep Associates separately)
- Biometric authentication
- Tablet optimization

---

## Definition of Done

- [ ] Firebase FCM project created, `google-services.json` and `GoogleService-Info.plist` placed (locally + as GitHub secrets)
- [ ] `TenantPushCredentials` row inserted in production DB for Vastudeep tenant
- [ ] `vastudeep.json` fully populated with real values (no PLACEHOLDERs)
- [ ] Vastudeep icons and splash assets placed for iOS and Android
- [ ] `pnpm config:tenant vastudeep` applies all values correctly
- [ ] Signed Android AAB submitted to Google Play internal track
- [ ] Signed iOS IPA submitted to TestFlight
- [ ] All 11 smoke test items pass on physical iOS and Android devices
- [ ] GitHub Actions `mobile/vastudeep/v1.0.0` tag triggers successful pipeline
- [ ] `.well-known` files verified accessible in production
- [ ] `apps/mobile/README.md` updated with lessons learned
