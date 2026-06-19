---
epicId: 4
storyId: '04-02'
title: 'Android Signing + Build'
status: ready
priority: high
estimate: 3
dependencies:
  - '04-01'
---

# Story 4.2 — Android Signing + Build

## Story

**As a** Flowtiq engineer,
**I want** the Android build to produce a signed AAB from environment variable credentials,
**so that** the CI/CD pipeline can publish to Google Play without manual signing steps.

---

## Context

A signed Android App Bundle (AAB) is required to submit to the Google Play Store. This story configures the Gradle signing configuration to read from environment variables (keystore as base64, plus passwords/alias). The keystore file itself is never committed to the repository. Story 4.5 (CI/CD pipeline) will use these env vars from GitHub Actions secrets.

Depends on Story 4.1 (tenant config system — `applicationId` must be configurable).

---

## Acceptance Criteria

### AC-1: Gradle signing config reads from environment variables

**Given** `apps/mobile/android/app/build.gradle`,
**When** the `signingConfigs.release` block is configured,
**Then** it reads credentials from environment variables:
```groovy
signingConfigs {
  release {
    storeFile file(System.getenv("KEYSTORE_FILE") ?: "release.keystore")
    storePassword System.getenv("KEYSTORE_PASSWORD") ?: ""
    keyAlias System.getenv("KEY_ALIAS") ?: ""
    keyPassword System.getenv("KEY_PASSWORD") ?: ""
  }
}
```

**And** the `release` build type uses this signing config:
```groovy
buildTypes {
  release {
    signingConfig signingConfigs.release
    minifyEnabled true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
  }
}
```

### AC-2: Keystore file never committed

**Given** the Android keystore file,
**When** any `.keystore` or `.jks` file is created locally,
**Then** `apps/mobile/android/.gitignore` includes `*.keystore` and `*.jks`.
**And** no keystore file exists in the git repository.

### AC-3: Keystore generation documented

**Given** `apps/mobile/README.md`,
**When** updated,
**Then** it documents the exact command to generate a new keystore:
```bash
keytool -genkey -v -keystore release.keystore \
  -alias flowtiq \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=Flowtiq, OU=Mobile, O=Flowtiq, L=Mumbai, ST=Maharashtra, C=IN"
```

**And** it documents how to encode the keystore for use as a GitHub secret:
```bash
base64 -i release.keystore | pbcopy  # macOS
```

### AC-4: Local release build verified

**Given** a local keystore file and the four environment variables set,
**When** the developer runs:
```bash
cd apps/mobile/android
KEYSTORE_FILE=../../release.keystore \
KEYSTORE_PASSWORD=xxx KEY_ALIAS=flowtiq KEY_PASSWORD=xxx \
./gradlew bundleRelease
```
**Then** the build succeeds and produces `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.

### AC-5: `pnpm` script added for release build

**Given** `apps/mobile/package.json`,
**When** updated,
**Then** an `android:release` script is added:
```json
"android:release": "cd android && ./gradlew bundleRelease"
```

**And** environment variables must be set before running (documented in README).

### AC-6: GitHub Actions secret names documented

**Given** `apps/mobile/README.md` and the workflow file (Story 4.5),
**When** this story is complete,
**Then** the following GitHub Actions secret names are documented with descriptions:

| Secret name | Description |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file content |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore store password |
| `ANDROID_KEY_ALIAS` | Key alias within the keystore |
| `ANDROID_KEY_PASSWORD` | Key password |

### AC-7: Google Play submission tool documented

**Given** the need to upload the AAB to Google Play internal track,
**When** the README is updated,
**Then** it documents the approach for CI (Story 4.5 will implement):
- Using Fastlane `supply` lane, OR
- Using the `r0adkll/upload-google-play` GitHub Action

**And** the Google Play service account JSON requirement is documented (required for automated upload — a service account must be created in Google Play Console with release manager permissions).

### AC-8: ProGuard rules updated for React Native

**Given** `apps/mobile/android/app/proguard-rules.pro`,
**When** the release build uses ProGuard/R8,
**Then** standard React Native keep rules are in place to prevent stripping of JS bridge code:
```
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
```

**And** any additional keep rules required by installed libraries (Keychain, Firebase, Notifee) are added per their documentation.

---

## Implementation Notes

### Decoding keystore in CI (for Story 4.5 reference)

In GitHub Actions:
```yaml
- name: Decode keystore
  run: |
    echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > apps/mobile/android/app/release.keystore
  env:
    KEYSTORE_FILE: app/release.keystore
```

### Hermes engine

React Native 0.70+ enables Hermes by default. Ensure `enableHermes: true` is in `build.gradle` (it likely is by default). Do not disable it.

### AAB vs APK

Always use AAB (`bundleRelease`) for Play Store submissions. APK (`assembleRelease`) is for direct device testing only.

---

## Out of Scope

- Google Play submission automation (Story 4.5)
- Per-tenant keystores (use one Flowtiq keystore for all tenant builds, as Flowtiq manages all app store accounts per Decision #11)
- App signing via Play Store managed signing (use local keystore for full control)

---

## Definition of Done

- [ ] `build.gradle` signing config reads from env vars
- [ ] `release` build type uses signing config
- [ ] `*.keystore` and `*.jks` in `.gitignore`
- [ ] README: keystore generation command, base64 encoding, env var documentation
- [ ] Local `./gradlew bundleRelease` succeeds with env vars set
- [ ] `android:release` script in `package.json`
- [ ] GitHub Actions secret names documented
- [ ] ProGuard rules updated for RN
