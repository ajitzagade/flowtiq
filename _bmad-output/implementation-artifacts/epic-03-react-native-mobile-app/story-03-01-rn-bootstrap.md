---
epicId: 3
storyId: '03-01'
title: 'React Native App Bootstrap'
status: ready
priority: high
estimate: 5
---

# Story 3.1 — React Native App Bootstrap

## Story

**As a** mobile developer,
**I want** the `apps/mobile` React Native project properly scaffolded inside the Turborepo monorepo,
**so that** all subsequent Epic 3 stories have a consistent, correctly configured foundation to build on.

---

## Context

This is the scaffolding story for the entire mobile app. It creates no feature logic — only the project structure, dependency baseline, monorepo wiring, and environment variable system. The React Native bare workflow is used (not Expo managed) to allow full native configuration access required for per-tenant builds in Epic 4.

All subsequent Epic 3 stories (`story-03-02` through `story-03-07`) depend on this story being complete.

---

## Acceptance Criteria

### AC-1: `apps/mobile` directory initialized as bare React Native project

**Given** the Flowtiq monorepo root,
**When** this story is complete,
**Then** `apps/mobile` exists as a React Native bare workflow project (initialized via `npx @react-native-community/cli init FlowtiqMobile --template react-native-template-typescript --directory apps/mobile` or equivalent).

**And** the project compiles and shows the default RN welcome screen on both iOS simulator and Android emulator before any feature work.

### AC-2: `package.json` configured for workspace

**Given** `apps/mobile/package.json`,
**When** the story is complete,
**Then**:
- `name` is `@flowtiq/mobile`
- `private: true`
- `@flowtiq/shared-types` is listed as a dependency (workspace reference)
- `engines.node` matches the monorepo minimum (≥18)

### AC-3: Monorepo workspace wiring

**Given** the repo root `pnpm-workspace.yaml`,
**When** `apps/mobile` is added,
**Then** `pnpm install` from the repo root completes without errors.

**And** `turbo.json` includes `@flowtiq/mobile` in the pipeline with at minimum `android` and `ios` tasks defined.

### AC-4: Minimum OS versions configured

**Given** the native project configuration files,
**When** the story is complete,
**Then** `apps/mobile/ios/Podfile` has `platform :ios, '15.0'` (iOS 15 minimum, per NFR-5-COMPAT-A).
**And** `apps/mobile/android/app/build.gradle` has `minSdkVersion 26` (Android API 26 minimum, per NFR-5-COMPAT-B).
**And** `targetSdkVersion` is set to the latest stable Android API level (≥33).

### AC-5: Core dependencies installed

**Given** `apps/mobile/package.json`,
**When** `pnpm install` completes,
**Then** the following packages are installed and linked:

| Package | Purpose |
|---|---|
| `react-native-webview` | WebView for embedding web app |
| `react-native-keychain` | Secure token storage (Keychain/Keystore) |
| `@react-native-cookies/cookies` | CookieManager for auth injection |
| `@react-native-firebase/app` | Firebase core |
| `@react-native-firebase/messaging` | FCM push notifications |
| `@notifee/react-native` | Foreground notification banners |
| `react-native-safe-area-context` | Safe area insets |
| `react-native-screens` | Native navigation screens |
| `@react-navigation/native` | Navigation core |
| `@react-navigation/bottom-tabs` | Tab bar / bottom nav |
| `@react-native-community/netinfo` | Connectivity monitoring |
| `react-native-config` | Environment variable access at runtime |

**And** all packages are compatible with the chosen React Native version.
**And** iOS pods are installed (`cd apps/mobile/ios && pod install` succeeds).

### AC-6: Environment variable system configured

**Given** `react-native-config` installed,
**When** the story is complete,
**Then** `apps/mobile/.env.example` exists with:
```
TENANT_WEBVIEW_URL=https://flowtiq-admin.vercel.app
TENANT_SLUG=flowtiq
TENANT_NAME=Flowtiq
```

**And** `apps/mobile/.env` is listed in `apps/mobile/.gitignore` (not committed).
**And** `react-native-config` is correctly linked so that `import Config from 'react-native-config'` works and `Config.TENANT_WEBVIEW_URL` returns the value.
**And** `apps/mobile/.env` (with actual Vastudeep values) is used for local development.

### AC-7: TypeScript configured

**Given** `apps/mobile/tsconfig.json`,
**When** the story is complete,
**Then** TypeScript is configured with `strict: true` and paths resolve correctly for `@flowtiq/shared-types`.
**And** `pnpm --filter @flowtiq/mobile type-check` (or `tsc --noEmit`) passes with zero errors on the scaffolded project.

### AC-8: Project structure documented

**Given** `apps/mobile/README.md`,
**When** the story is complete,
**Then** the README documents:
- How to run on iOS simulator and Android emulator
- Required environment variables
- How to add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) for Firebase
- How to install pods (`cd ios && pod install`)
- pnpm commands for build and run

### AC-9: Source directory structure established

**Given** `apps/mobile/src/`,
**When** the story is complete,
**Then** the following empty directories (with `.gitkeep`) are created for future stories:
- `src/screens/` — screen components
- `src/components/` — shared native components
- `src/lib/` — utilities and bridge handler
- `src/navigation/` — navigation configuration

---

## Implementation Notes

### React Native version

Use the latest stable React Native version compatible with `@react-native-firebase/messaging` and `@notifee/react-native`. At time of writing, React Native 0.73+ is recommended. Check compatibility before pinning a version.

### pnpm + React Native known issues

React Native CLI does not natively support pnpm workspaces. Add `node-linker=hoisted` to `.npmrc` at the monorepo root if not already present, or use a dedicated `.npmrc` in `apps/mobile`. Alternatively, use `shamefully-hoist=true` if required for native module linking.

### Firebase setup placeholder

Do NOT add actual `google-services.json` or `GoogleService-Info.plist` in this story. These are per-tenant files added in Epic 4. The README must document where they must be placed:
- Android: `apps/mobile/android/app/google-services.json`
- iOS: `apps/mobile/ios/GoogleService-Info.plist`

The Firebase packages will fail to build without these files — document this and use placeholder/stub files for CI until Epic 4.

### Turborepo task definitions

Add to `turbo.json`:
```json
{
  "tasks": {
    "@flowtiq/mobile#android": { "cache": false },
    "@flowtiq/mobile#ios": { "cache": false },
    "@flowtiq/mobile#type-check": { "dependsOn": ["^build"] }
  }
}
```

---

## Out of Scope

- Any screen or feature implementation (covered in Stories 3.2–3.7)
- Per-tenant build configuration (Epic 4)
- CI/CD pipeline for mobile (Epic 4, Story 4.5)
- Actual Firebase credentials (Epic 4)

---

## Definition of Done

- [ ] `apps/mobile` initialized as bare RN TypeScript project
- [ ] `package.json` name `@flowtiq/mobile`, workspace dependency on `@flowtiq/shared-types`
- [ ] `pnpm-workspace.yaml` updated; `pnpm install` passes
- [ ] iOS minOS 15, Android minSdk 26 configured
- [ ] All 13 core packages installed and pods linked
- [ ] `.env.example` created; `.env` gitignored
- [ ] `react-native-config` wired and accessible
- [ ] `tsconfig.json` with strict mode
- [ ] `pnpm type-check` passes
- [ ] Default RN welcome screen runs on iOS simulator and Android emulator
- [ ] `apps/mobile/README.md` documents setup steps
- [ ] `src/` directory structure created
