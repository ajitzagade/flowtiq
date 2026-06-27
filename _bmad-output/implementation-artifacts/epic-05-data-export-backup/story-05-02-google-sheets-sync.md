---
epicId: 5
storyId: '05-02'
title: 'Google Sheets Integration & Manual Sync'
status: review
priority: high
estimate: 5
---

# Story 5.2 — Google Sheets Integration & Manual Sync

## Story

**As an** admin user,
**I want** to connect a Google Sheet and push all project data into it with one click,
**so that** my team can view live project data in Google Sheets without manual copy-paste.

---

## Context

This story adds Google Sheets as an export destination. A tenant admin provides a Google Service Account JSON (downloaded from Google Cloud Console) and a target Spreadsheet ID. The credentials are stored securely in the database (encrypted at rest is out of scope for this story — stored as encrypted JSON string). A `POST /api/export/google-sheets/sync` endpoint writes all project, financial, and follow-up data into the configured sheet (one tab per data type, same schema as the Excel export). The Settings "Export & Backup" tab (created in Story 5.1) is extended with a Google Sheets configuration card.

**Depends on**: Story 5.1 (Export & Backup settings tab must exist)

---

## Acceptance Criteria

### AC-1: New Prisma model `TenantExportConfig` added to schema

**Given** `packages/database/prisma/schema.prisma`,
**When** the migration runs,
**Then** a `tenant_export_configs` table exists with columns:
- `id` String cuid PK
- `tenantId` String UNIQUE
- `googleServiceAccountJson` String? (stores the full service account JSON)
- `googleSpreadsheetId` String? (the ID portion of the sheet URL)
- `googleSyncEnabled` Boolean default false
- `lastSyncedAt` DateTime? (null until first sync)
- `lastSyncStatus` String? (`'success'` | `'error'` | null)
- `lastSyncError` String? (error message from last failed sync, null on success)
- `createdAt` DateTime default now
- `updatedAt` DateTime updatedAt

**And** a FK relation to `Tenant` with cascade delete.
**And** a reverse relation `exportConfig TenantExportConfig?` added to the `Tenant` model.
**And** `pnpm db:generate` and `pnpm db:push` complete without errors.

---

### AC-2: Shared types updated

**Given** `packages/shared-types/src/index.ts`,
**When** the story is complete,
**Then** the following are exported:
```typescript
export interface TenantExportConfig {
  id: string;
  tenantId: string;
  googleSpreadsheetId: string | null;
  googleSyncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: 'success' | 'error' | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}
// Note: googleServiceAccountJson is NOT included in the shared type (sensitive — never sent to frontend)
```

---

### AC-3: `googleapis` dependency installed

**Given** `services/api/package.json`,
**When** the story is implemented,
**Then** `googleapis` (^144.x) is listed as a dependency.
**And** TypeScript can import `import { google } from 'googleapis'` without errors.

---

### AC-4: `GET /api/export/google-sheets/config` — fetch current config

**Given** an authenticated user with `reports:view` permission,
**When** `GET /api/export/google-sheets/config` is called,
**Then** the response is:
```json
{
  "success": true,
  "data": {
    "googleSpreadsheetId": "...",
    "googleSyncEnabled": true,
    "hasServiceAccount": true,
    "lastSyncedAt": "2026-06-27T10:00:00.000Z",
    "lastSyncStatus": "success",
    "lastSyncError": null
  }
}
```
**And** `hasServiceAccount` is `true` if `googleServiceAccountJson` is non-null in the DB, `false` otherwise.
**And** `googleServiceAccountJson` is NEVER returned in the response (security: credentials stay server-side).

**Given** no config exists for the tenant yet,
**Then** the response returns default values: `googleSpreadsheetId: null`, `googleSyncEnabled: false`, `hasServiceAccount: false`, sync fields null.

---

### AC-5: `PUT /api/export/google-sheets/config` — save config

**Given** an authenticated user with `roles:manage` permission (admin-level),
**When** `PUT /api/export/google-sheets/config` is called with body:
```json
{
  "googleServiceAccountJson": "{...}",
  "googleSpreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "googleSyncEnabled": true
}
```
**Then** the config is upserted for the tenant (create if none, update if exists).
**And** the response is `{ "success": true, "data": { ...config without serviceAccountJson... } }`.

**Given** `googleServiceAccountJson` is an invalid JSON string,
**Then** the response is `400` with `{ "success": false, "error": "Invalid service account JSON" }`.

**Given** `googleServiceAccountJson` is valid JSON but missing required fields (`type`, `project_id`, `private_key`, `client_email`),
**Then** the response is `400` with `{ "success": false, "error": "Service account JSON missing required fields" }`.

**Given** `googleServiceAccountJson` is omitted from the request (only updating spreadsheetId or syncEnabled),
**Then** the existing stored service account JSON is preserved (not overwritten).

---

### AC-6: `POST /api/export/google-sheets/sync` — trigger manual sync

**Given** an authenticated user with `reports:view` permission,
**When** `POST /api/export/google-sheets/sync` is called,
**Then** if no config exists or `googleServiceAccountJson` is null:
- Response: `400 { "success": false, "error": "Google Sheets not configured. Please add a service account and spreadsheet ID in Settings." }`

**Given** valid config exists,
**Then** the endpoint:
1. Parses the stored `googleServiceAccountJson`
2. Authenticates a Google JWT auth client using the service account
3. Uses the Sheets API to clear + write each data tab (see AC-7)
4. Updates `lastSyncedAt = now()`, `lastSyncStatus = 'success'`, `lastSyncError = null`
5. Returns `{ "success": true, "data": { "syncedAt": "...", "sheetsUpdated": 7 } }`

**Given** the Sheets API returns an error (e.g. sheet not shared with service account, invalid spreadsheet ID),
**Then** `lastSyncStatus = 'error'` and `lastSyncError = <error message>` are saved to DB.
**And** the response is `502 { "success": false, "error": "Google Sheets sync failed: <message>" }`.

---

### AC-7: Sheet tab structure mirrors Excel export

**Given** a successful sync call,
**When** the Google Sheet is opened,
**Then** the spreadsheet contains the same 7 tabs as the Excel export (Story 5.1 AC-3), with identical column headers:
1. Projects
2. Project Financials
3. Payment Milestones
4. Invoices
5. Invoice Payments
6. Follow-ups
7. Users

**And** each tab is fully cleared (`spreadsheets.values.clear`) before writing new data.
**And** the first row of each tab is the header row (matches AC-4 through AC-10 of Story 5.1 exactly).
**And** the data is written using `spreadsheets.values.batchUpdate` with `valueInputOption: 'USER_ENTERED'` so Google Sheets parses dates and numbers natively.

---

### AC-8: Service account must be granted access to the sheet by the user

**Given** the service account's `client_email` is not an editor on the target Google Sheet,
**When** sync is attempted,
**Then** the Sheets API returns a 403 permission error.
**And** `lastSyncError` is set to `"Permission denied. Share the spreadsheet with <client_email> as Editor."`.
**And** the API response is `502` with the same clear message.

---

### AC-9: Audit log on sync

**Given** a sync attempt (success or failure),
**When** the endpoint completes,
**Then** `createAuditLog` is called with:
- `action: 'export'`
- `module: 'export'`
- `description: 'Google Sheets sync triggered — status: <success|error>'`

---

### AC-10: Settings UI — Google Sheets configuration card

**Given** the "Export & Backup" tab in Settings (from Story 5.1),
**When** it renders,
**Then** below the Excel download section, a second section titled "Google Sheets Sync" appears.

**The section contains:**
- A connection status badge: "Not configured" (grey) | "Configured" (green) | "Last sync failed" (red)
- A `<textarea>` labelled "Service Account JSON" (rows=6, placeholder: `Paste your Google Service Account JSON here...`)
- An `<input type="text">` labelled "Google Spreadsheet ID" with helper text: "Found in the sheet URL: `docs.google.com/spreadsheets/d/<ID>/edit`"
- A toggle/checkbox labelled "Enable automatic sync" (controls `googleSyncEnabled`)
- A "Save Configuration" button
- A "Sync Now" button (enabled only when `hasServiceAccount && googleSpreadsheetId` is set)
- A "Last synced" line showing relative time and status (e.g. "Synced 2 hours ago" in green, or "Failed 1 hour ago — Permission denied..." in red)

**Given** the user fills in the service account JSON and spreadsheet ID and clicks "Save Configuration",
**Then** `PUT /api/export/google-sheets/config` is called.
**And** on success: `toast.success('Google Sheets configuration saved')`.
**And** on error: `toast.error(errorMessage)`.

**Given** the user clicks "Sync Now",
**Then** the button shows a spinner and is disabled.
**And** `POST /api/export/google-sheets/sync` is called.
**And** on success: `toast.success('Google Sheets synced successfully')` and the last-sync time updates.
**And** on failure: `toast.error('Sync failed: <error message from API>')`.

---

### AC-11: Service account JSON is never logged or exposed

**Given** any log output, audit trail, or API response,
**Then** the full `googleServiceAccountJson` string is NEVER included.
**And** only `client_email` extracted from the JSON may appear in error messages (for the "share with this address" UX, AC-8).

---

### AC-12: TypeScript compilation passes

**Given** all changes,
**When** `pnpm type-check` is run,
**Then** zero TypeScript errors are reported.

---

## Dev Notes

### Google Auth pattern (service account)

```typescript
import { google } from 'googleapis';

const credentials = JSON.parse(config.googleServiceAccountJson);
const auth = new google.auth.JWT(
  credentials.client_email,
  undefined,
  credentials.private_key,
  ['https://www.googleapis.com/auth/spreadsheets'],
);
const sheets = google.sheets({ version: 'v4', auth });
```

### Writing data to a sheet tab

```typescript
// Clear existing data
await sheets.spreadsheets.values.clear({
  spreadsheetId,
  range: 'Projects',
});

// Write header + rows
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: 'Projects!A1',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [headerRow, ...dataRows] },
});
```

### Tab creation

On first sync, if the named tab doesn't exist, create it via `spreadsheets.batchUpdate` with `addSheet` request. On subsequent syncs, just clear and rewrite.

### Route structure

- File: `services/api/src/routes/export.ts` (extending from Story 5.1)
- New sub-routes:
  - `GET  /api/export/google-sheets/config`
  - `PUT  /api/export/google-sheets/config`
  - `POST /api/export/google-sheets/sync`
- All require `authenticate` + `requirePermission('reports:view')` except PUT which requires `'roles:manage'`

### Required fields in service account JSON

`type`, `project_id`, `private_key`, `client_email` — validate presence before saving.

---

## Out of Scope

- OAuth flow for user-level Google account (we use service account only)
- Scheduled sync (Story 5.3)
- Encrypting the service account JSON at rest (deferred — store as-is in `googleServiceAccountJson` column)
- Multiple spreadsheet destinations per tenant
- Partial sync (individual sheets only)

---

## Definition of Done

- [x] `TenantExportConfig` Prisma model added; `pnpm db:push` passes
- [x] `TenantExportConfig` interface exported from `@flowtiq/shared-types`
- [x] `googleapis` installed in `services/api`
- [x] `GET`, `PUT` config endpoints implemented with correct permission gates
- [x] `POST /sync` endpoint writes all 7 tabs, handles permission errors gracefully
- [x] `lastSyncedAt`, `lastSyncStatus`, `lastSyncError` updated after every sync attempt
- [x] Audit log created on every sync attempt
- [x] Service account JSON never exposed in any response or log
- [x] Settings UI card: configure + sync now + status badge + last-sync line
- [x] Toast feedback on all async actions
- [x] `pnpm type-check` passes

## Dev Agent Record

### Completion Notes

Added `TenantExportConfig` and `TenantBackupRun` Prisma models (both in Story 5.2 to avoid a second migration in 5.3). `googleapis` installed, JWT auth using `google.auth.JWT` options object form. Google Sheets sync: checks for existing tabs via `spreadsheets.get`, creates missing tabs via `batchUpdate addSheet`, clears + rewrites each of the 7 tabs. Permission error (403) mapped to friendly message including service account email. `TenantBackupRun` record written on every sync attempt. `put<T>` helper added to `@/lib/api.ts`. Settings UI: `ExportBackupTab` now has three cards — Excel download, Google Sheets config/sync, Backup History.

### File List

- `packages/database/prisma/schema.prisma` (modified — added TenantExportConfig, TenantBackupRun, reverse relations)
- `packages/shared-types/src/index.ts` (modified — added BackupSchedule, BackupRunType, BackupRunStatus, TenantExportConfig, TenantExportConfigPublic, TenantBackupRun)
- `services/api/src/routes/export.ts` (modified — added Google Sheets routes, shared data-fetching helpers)
- `services/api/package.json` (modified — added googleapis)
- `apps/admin-portal/src/lib/api.ts` (modified — added put helper)
- `apps/admin-portal/src/app/(dashboard)/settings/page.tsx` (modified — full ExportBackupTab with Google Sheets UI)

### Change Log

- 2026-06-27: Story 5.2 implemented — Google Sheets config, sync, and backup history UI
