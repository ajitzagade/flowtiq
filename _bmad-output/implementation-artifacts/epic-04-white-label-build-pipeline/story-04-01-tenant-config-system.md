---
epicId: 4
storyId: '04-01'
title: 'Tenant Config System'
status: review
priority: high
estimate: 3
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
dependencies:
  - '03-01'
---

# Story 4.1 — Tenant Config System

## Story

**As a** Flowtiq engineer,
**I want** a single JSON config file per tenant that drives all build-time customizations,
**so that** onboarding a new tenant requires only creating one config file and running one script.

---

## Context

This story establishes the configuration-as-code pattern for white-label builds. A per-tenant JSON file defines all variable values (app name, bundle IDs, colors, URLs, FCM project). A Node.js script reads the JSON and applies values to the correct native project files before building.

The Vastudeep config is the reference (and will be fully populated in Story 4.6). This story creates the structure and a working script — Story 4.6 fills in real values.

Depends on Story 3.1 (native project must exist to have files to modify).

---

## Acceptance Criteria

### AC-1: `configs/build/tenant-configs/` directory created at repo root level

**Given** the Flowtiq monorepo root,
**When** this story is complete,
**Then** `configs/build/tenant-configs/` exists as a top-level config directory (alongside `configs/` if it already exists, or created fresh).
**And** the directory is tracked in git (with a `.gitkeep` if empty).

### AC-2: `vastudeep.json` reference config created

**Given** `configs/build/tenant-configs/vastudeep.json`,
**When** the story is complete,
**Then** the file contains all required fields:

```json
{
  "slug": "vastudeep",
  "appName": "Vastudeep Flowtiq",
  "bundleId": "com.vastudeep.flowtiq",
  "applicationId": "com.vastudeep.flowtiq",
  "primaryColor": "#PLACEHOLDER",
  "secondaryColor": "#PLACEHOLDER",
  "webviewUrl": "https://flowtiq-admin.vercel.app",
  "tenantDomain": "flowtiq-admin.vercel.app",
  "fcmProjectId": "PLACEHOLDER_FCM_PROJECT_ID",
  "iosTeamId": "PLACEHOLDER_APPLE_TEAM_ID",
  "apnsBundleId": "com.vastudeep.flowtiq",
  "storeName": "Vastudeep Flowtiq",
  "storeDescription": "Project management platform for Vastudeep Associates"
}
```

**And** `PLACEHOLDER` values are clearly marked for replacement in Story 4.6.

### AC-3: `flowtiq.json` default/development config created

**Given** `configs/build/tenant-configs/flowtiq.json`,
**When** the story is complete,
**Then** the file contains the same schema as `vastudeep.json` with values pointing to the development Vercel URL and a `com.flowtiq.mobile` bundle ID.
**And** this config is used by default for local development runs.

### AC-4: `scripts/apply-tenant-config.js` script created

**Given** the script at `scripts/apply-tenant-config.js`,
**When** invoked as `node scripts/apply-tenant-config.js <slug>` (e.g. `node scripts/apply-tenant-config.js vastudeep`),
**Then** the script:
1. Reads `configs/build/tenant-configs/<slug>.json`
2. Writes `apps/mobile/.env` with the following variables:
   ```
   TENANT_WEBVIEW_URL=<config.webviewUrl>
   TENANT_SLUG=<config.slug>
   TENANT_NAME=<config.appName>
   TENANT_DOMAIN=<config.tenantDomain>
   ```
3. Updates `apps/mobile/android/app/build.gradle` — replaces the `applicationId` value with `config.applicationId`
4. Updates `apps/mobile/android/app/src/main/res/values/strings.xml` — replaces `<string name="app_name">` value with `config.appName`
5. Updates `apps/mobile/ios/FlowtiqMobile/Info.plist` — sets `CFBundleDisplayName` to `config.appName` and `CFBundleIdentifier` to `config.bundleId`

**And** each file modification is logged to stdout: `✓ Updated android/build.gradle applicationId to com.vastudeep.flowtiq`

### AC-5: Script exits with error on missing config

**Given** the script is run with an unknown slug,
**When** `configs/build/tenant-configs/<slug>.json` does not exist,
**Then** the script exits with code 1 and logs: `Error: No config found for tenant slug: <slug>`.

### AC-6: Script validates required fields

**Given** a config JSON with missing required fields,
**When** the script reads the file,
**Then** it validates all required fields are present.
**And** if any required field is absent, exits with code 1 and logs which field is missing.
**And** PLACEHOLDER values are allowed (no validation of placeholder contents — that is Story 4.6's concern).

### AC-7: Script added to `package.json` scripts

**Given** the root `package.json`,
**When** this story is complete,
**Then** a `config:tenant` script is added:
```json
"config:tenant": "node scripts/apply-tenant-config.js"
```

**And** it can be invoked as `pnpm config:tenant vastudeep`.

### AC-8: `apps/mobile/.env` in `.gitignore`

**Given** `apps/mobile/.gitignore`,
**When** the script generates `.env`,
**Then** `.env` is listed in `.gitignore` so it is never committed.
**And** `.env.example` (from Story 3.1) IS committed as documentation.

### AC-9: `scripts/` directory and script committed

**Given** the script file,
**When** committed,
**Then** `scripts/apply-tenant-config.js` is committed to the repository (it contains no secrets).
**And** the `scripts/` directory is at the monorepo root level.

### AC-10: README documents the config system

**Given** `apps/mobile/README.md`,
**When** updated,
**Then** it documents:
- The config file location and schema
- How to run the script: `pnpm config:tenant <slug>`
- Which files the script modifies
- How to add a new tenant (create JSON + run script)

---

## Implementation Notes

### build.gradle modification

The `applicationId` in `apps/mobile/android/app/build.gradle` is typically on a line like:
```
applicationId "com.flowtiqmobile"
```

Use `fs.readFileSync` + `String.replace` with a regex to update it:
```javascript
const content = fs.readFileSync(gradlePath, 'utf8');
const updated = content.replace(
  /applicationId\s+"[^"]+"/,
  `applicationId "${config.applicationId}"`
);
fs.writeFileSync(gradlePath, updated);
```

### Info.plist modification

Use the `plist` npm package (add to root `devDependencies`) or simple string replace. The plist approach is more robust:
```javascript
const plist = require('plist');
const content = fs.readFileSync(infoPlistPath, 'utf8');
const parsed = plist.parse(content);
parsed.CFBundleDisplayName = config.appName;
parsed.CFBundleIdentifier = config.bundleId;
fs.writeFileSync(infoPlistPath, plist.build(parsed));
```

### strings.xml modification

```javascript
const content = fs.readFileSync(stringsPath, 'utf8');
const updated = content.replace(
  /<string name="app_name">[^<]*<\/string>/,
  `<string name="app_name">${config.appName}</string>`
);
fs.writeFileSync(stringsPath, updated);
```

### Script is plain Node.js (no TypeScript compilation required)

Use `.js` with CommonJS (`require`/`module.exports`) to keep it dependency-free. Only `plist` needs to be added if the plist approach is used.

---

## Out of Scope

- Dynamic branding colors applied at runtime (the web app reads from `Tenant.branding` JSON from the API — no native color theming needed for Phase 2)
- Asset replacement (app icons, splash images) via script — done manually in Story 4.6
- Automated config validation beyond required field presence

---

## Definition of Done

- [x] `configs/build/tenant-configs/vastudeep.json` created with all required fields
- [x] `configs/build/tenant-configs/flowtiq.json` created as development default
- [x] `scripts/apply-tenant-config.js` created and executable
- [x] Script modifies: `.env`, `build.gradle`, `strings.xml`, `Info.plist`
- [x] Script validates config file exists and required fields present
- [x] `pnpm config:tenant vastudeep` runs without error
- [x] `.env` gitignored
- [x] `apps/mobile/README.md` updated with config system documentation

## Dev Agent Record

### Implementation Notes
- Created `configs/build/tenant-configs/vastudeep.json` with all required fields (PLACEHOLDER values where real credentials needed for Story 4.6)
- Created `configs/build/tenant-configs/flowtiq.json` as development default using `com.flowtiq.mobile` bundle ID
- Created `scripts/apply-tenant-config.js` using CommonJS string-replace approach (no external `plist` dependency required)
- Created `apps/mobile/android/app/src/main/res/values/strings.xml` (required for script to update app_name)
- Created `apps/mobile/ios/FlowtiqMobile/Info.plist` (required for script to update CFBundleDisplayName and CFBundleIdentifier)
- Added `config:tenant` script to root `package.json`
- `.env` was already in `apps/mobile/.gitignore` from Story 3.1
- `apps/mobile/README.md` updated with full config system documentation

### Review Findings

- [x] [Review][Patch] XML injection — appName with `&`, `<`, `>` corrupts strings.xml and Info.plist [scripts/apply-tenant-config.js:101-133]
- [x] [Review][Patch] JS `$`-pattern injection — regex replacement uses config values as replacement strings; `$1`/`$2` in appName/bundleId produces mangled output; use function form of replace() [scripts/apply-tenant-config.js:81-132]
- [x] [Review][Patch] Slug path traversal — no sanitization on process.argv[2]; validate slug matches `[a-z0-9-]+` before path construction [scripts/apply-tenant-config.js:44]
- [x] [Review][Patch] Info.plist update silently writes even when neither regex matches; add match detection like build.gradle/strings.xml [scripts/apply-tenant-config.js:120-134]
- [x] [Review][Patch] `config.slug` field not validated against filename slug — mismatch produces inconsistent .env (TENANT_SLUG) vs native file values [scripts/apply-tenant-config.js:56-70]

### Change Log
- 2026-06-20: Implemented Story 4.1 — Tenant Config System
- 2026-06-20: Code review findings added
- 2026-06-20: Applied all review patches — slug path traversal validation, XML escape for appName, function-form replace to prevent $-pattern injection, config.slug mismatch validation, Info.plist match detection, Appfile/Matchfile rewriting, TENANT_BUNDLE_ID/TENANT_APPLICATION_ID added to .env
