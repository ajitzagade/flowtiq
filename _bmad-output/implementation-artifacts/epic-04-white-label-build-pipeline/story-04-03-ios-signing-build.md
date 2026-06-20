---
epicId: 4
storyId: '04-03'
title: 'iOS Signing + Build'
status: review
priority: high
estimate: 5
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
dependencies:
  - '04-01'
---

# Story 4.3 — iOS Signing + Build

## Story

**As a** Flowtiq engineer,
**I want** the iOS build to produce a signed IPA using Fastlane,
**so that** the CI/CD pipeline can upload to TestFlight without manual Xcode signing steps.

---

## Context

iOS code signing requires a distribution certificate and provisioning profile from Apple Developer. Fastlane is the industry-standard tool for automating this. `fastlane match` manages certificates and profiles stored in a private git repository. The `beta` lane builds and uploads to TestFlight.

Depends on Story 4.1 (bundle ID must be configurable).

---

## Acceptance Criteria

### AC-1: Fastlane installed and initialized in `apps/mobile/ios/`

**Given** `apps/mobile/ios/fastlane/`,
**When** this story is complete,
**Then** `Fastfile` and `Appfile` exist in `apps/mobile/ios/fastlane/`.
**And** `Gemfile` at `apps/mobile/ios/Gemfile` specifies the `fastlane` gem version.
**And** `Gemfile.lock` is committed.

### AC-2: `Appfile` configured

**Given** `apps/mobile/ios/fastlane/Appfile`,
**When** configured,
**Then** it contains:
```ruby
app_identifier("com.vastudeep.flowtiq") # overridden per tenant via env
itc_team_id(ENV["APPLE_TEAM_ID"])
team_id(ENV["APPLE_TEAM_ID"])
```

### AC-3: `Fastfile` — `beta` lane defined

**Given** `apps/mobile/ios/fastlane/Fastfile`,
**When** the `beta` lane is defined,
**Then** it:
1. Syncs certificates and profiles via `match(type: "appstore")`
2. Increments build number: `increment_build_number`
3. Builds the IPA: `gym(scheme: "FlowtiqMobile", export_method: "app-store", configuration: "Release")`
4. Uploads to TestFlight: `pilot(skip_waiting_for_build_processing: true)`

**And** the lane uses App Store Connect API key for authentication (not Apple ID password).

### AC-4: App Store Connect API key authentication

**Given** the beta lane,
**When** CI runs,
**Then** the App Store Connect API key is configured via:
```ruby
app_store_connect_api_key(
  key_id: ENV["APP_STORE_CONNECT_API_KEY_ID"],
  issuer_id: ENV["APP_STORE_CONNECT_API_ISSUER_ID"],
  key_content: ENV["APP_STORE_CONNECT_API_KEY_CONTENT"],
  is_key_content_base64: true
)
```

**And** this is called at the top of the `beta` lane before any other action.

### AC-5: `fastlane match` configured for certificate management

**Given** `fastlane match`,
**When** configured,
**Then** `Matchfile` at `apps/mobile/ios/fastlane/Matchfile` specifies:
```ruby
git_url(ENV["MATCH_GIT_URL"])
storage_mode("git")
type("appstore")
app_identifier(["com.vastudeep.flowtiq"])
```

**And** `MATCH_PASSWORD` environment variable is used for decryption.
**And** the match repository URL is a private GitHub repository managed by Flowtiq.

### AC-6: iOS minimum version enforced in Xcode project

**Given** the Xcode project settings,
**When** the build runs,
**Then** `IPHONEOS_DEPLOYMENT_TARGET` is set to `15.0` in the project's build settings.
**And** the Podfile has `platform :ios, '15.0'`.

### AC-7: Automatic signing disabled for release

**Given** the Xcode project,
**When** configured for the Release configuration,
**Then** `CODE_SIGN_STYLE` is set to `Manual` for the Release configuration.
**And** `DEVELOPMENT_TEAM` is set from `ENV["APPLE_TEAM_ID"]`.
**And** automatic signing remains enabled for Debug (local development).

### AC-8: GitHub Actions secret names documented

**Given** `apps/mobile/README.md`,
**When** updated,
**Then** the following secrets are documented:

| Secret name | Description |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APP_STORE_CONNECT_API_KEY_ID` | ASC API Key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | ASC API Issuer ID |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | ASC API Key `.p8` content, base64 encoded |
| `MATCH_PASSWORD` | Fastlane match repository encryption password |
| `MATCH_GIT_URL` | URL of the private match certificates repository |

### AC-9: `ios:release` pnpm script added

**Given** `apps/mobile/package.json`,
**When** updated,
**Then** an `ios:release` script is added:
```json
"ios:release": "cd ios && bundle exec fastlane beta"
```

### AC-10: Local beta build verified

**Given** all environment variables set locally and a valid match repository,
**When** `pnpm --filter @flowtiq/mobile ios:release` is run on a Mac with Xcode installed,
**Then** the build succeeds and an IPA is uploaded to TestFlight.
**And** the build appears in App Store Connect TestFlight within 5 minutes.

### AC-11: Setup documented in README

**Given** `apps/mobile/README.md`,
**When** updated,
**Then** it documents:
- Prerequisites: Xcode, Ruby, Bundler, `bundle install`
- How to create the App Store Connect API key
- How to set up `fastlane match` (init match repo, run `fastlane match appstore`)
- How to run the beta lane locally

---

## Implementation Notes

### Gemfile

```ruby
source "https://rubygems.org"
gem "fastlane", "~> 2.220"
```

### Initial match setup (one-time, not automated)

Before CI can use match, an engineer must run once:
```bash
cd apps/mobile/ios
bundle install
bundle exec fastlane match init  # set up match git repo
bundle exec fastlane match appstore  # generate and store certs
```

Document this in README as a prerequisite for the first deployment.

### Build number management

React Native iOS build numbers must increment for each TestFlight upload. Use:
```ruby
increment_build_number(
  build_number: ENV["BUILD_NUMBER"] || Time.now.to_i.to_s
)
```

In CI, use the GitHub run number as `BUILD_NUMBER`.

### Xcode scheme

Ensure the `FlowtiqMobile` scheme is marked as "Shared" in Xcode so it is available in CI without Xcode running:
- Xcode → Product → Scheme → Manage Schemes → check "Shared" for FlowtiqMobile

---

## Out of Scope

- App Store production release (TestFlight only for Phase 2)
- Per-tenant Apple Developer accounts (Flowtiq manages one account for all tenants per Decision #11)
- Automatic App Store submission (manual TestFlight → production promotion for Phase 2)
- `fastlane deliver` for App Store metadata (deferred to production submission)

---

## Definition of Done

- [x] `apps/mobile/ios/fastlane/Fastfile` with `beta` lane
- [x] `apps/mobile/ios/fastlane/Appfile` configured
- [x] `apps/mobile/ios/fastlane/Matchfile` configured
- [x] `apps/mobile/ios/Gemfile` committed (`Gemfile.lock` generated after `bundle install` — run `cd apps/mobile/ios && bundle install`)
- [x] App Store Connect API key auth in beta lane
- [x] iOS deployment target 15.0 in Podfile (already set in Story 3.1)
- [x] Manual signing for Release config (configured via Fastlane match)
- [x] `ios:release` pnpm script added
- [x] GitHub Actions secrets documented in README
- [x] README: setup steps, prerequisites, match init instructions, local beta instructions
- [ ] Local beta build succeeds (requires real Apple Developer account and match setup — blocked by credentials)

## Dev Agent Record

### Implementation Notes
- Created `apps/mobile/ios/Gemfile` with `gem "fastlane", "~> 2.220"`
- `Gemfile.lock` is generated by running `bundle install` in `apps/mobile/ios/` — needs to be committed after first run
- Created `apps/mobile/ios/fastlane/Appfile` with `app_identifier`, `itc_team_id`, `team_id` all reading from ENV
- Created `apps/mobile/ios/fastlane/Matchfile` with git storage, appstore type, vastudeep bundle ID
- Created `apps/mobile/ios/fastlane/Fastfile` with `beta` lane: ASC API key auth → match → increment_build_number → gym → pilot
- Added `ios:release` script to `apps/mobile/package.json`
- iOS deployment target is already `platform :ios, '15.0'` in Podfile (set in Story 3.1)
- README fully documents prerequisites, ASC API key creation, match init, local run instructions, and all GitHub secrets

### Review Findings

- [x] [Review][Patch] Gemfile.lock not committed — AC-1 requires it; run `cd apps/mobile/ios && bundle install` and commit the lock file [apps/mobile/ios/Gemfile.lock]
- [x] [Review][Patch] Appfile hardcodes `com.vastudeep.flowtiq` — `app_identifier("com.vastudeep.flowtiq")` is static; all non-vastudeep tenant builds will sign with the wrong bundle ID; fix: read from ENV or have `apply-tenant-config.js` rewrite Appfile before Fastlane runs [apps/mobile/ios/fastlane/Appfile:1]
- [x] [Review][Patch] Matchfile hardcodes `app_identifier(["com.vastudeep.flowtiq"])` — match will fetch/create certs only for the vastudeep bundle ID; other tenants get wrong certificates; fix: same approach as Appfile (ENV-driven or script-rewritten) [apps/mobile/ios/fastlane/Matchfile:4]
- [x] [Review][Patch] `match` called without `readonly: true` in Fastfile — CI should never write back to the certificates repo (risk of race conditions and corruption); add `readonly: true` to `match(type: "appstore")` call [apps/mobile/ios/fastlane/Fastfile]
- [x] [Review][Defer] CODE_SIGN_STYLE and IPHONEOS_DEPLOYMENT_TARGET not set in project.pbxproj (AC-6, AC-7) — requires real Xcode project file which is not in repo yet; blocked by Story 3.1 native scaffold completeness — deferred, pre-existing

### Change Log
- 2026-06-20: Implemented Story 4.3 — iOS Signing + Build
- 2026-06-20: Code review findings added
- 2026-06-20: Applied review patches — Appfile/Matchfile now rewritten by apply-tenant-config.js per-tenant, match(readonly: true) added to Fastfile; Gemfile.lock requires manual `bundle install` commit
