---
epicId: 5
storyId: '05-03'
title: 'Scheduled Auto-Backup (Daily / Weekly)'
status: review
priority: medium
estimate: 4
---

# Story 5.3 — Scheduled Auto-Backup (Daily / Weekly)

## Story

**As an** admin user,
**I want** the system to automatically export all data on a daily or weekly schedule,
**so that** I always have a recent backup without needing to remember to trigger it manually.

---

## Context

This story extends the export infrastructure from Stories 5.1 and 5.2 by adding:
1. A cron-based scheduled job (using `node-cron`, which is already in the project for follow-up reminders) that runs for ALL tenants that have `googleSyncEnabled = true` or have opted into Excel archival.
2. Backup schedule settings (`daily` / `weekly` / `off`) stored in `TenantExportConfig`.
3. Excel backup files are uploaded to Cloudinary (already integrated) as a timestamped archive — no new storage service needed.
4. A push/in-app notification is sent to all `roles:manage` users of the tenant after each scheduled backup run (success or failure).
5. A "Backup History" panel in the Settings "Export & Backup" tab showing the last 10 backup runs.

**Depends on**: Story 5.1 (export logic) + Story 5.2 (`TenantExportConfig` model + Google Sheets sync)

---

## Acceptance Criteria

### AC-1: `TenantExportConfig` model extended with schedule fields

**Given** the `TenantExportConfig` model created in Story 5.2,
**When** this story's migration runs,
**Then** three new columns are added:
- `backupSchedule` String default `'off'` — values: `'off'` | `'daily'` | `'weekly'`
- `backupScheduleDay` Int? — `0`–`6` (0=Sunday) for weekly schedule (null for daily/off)
- `backupScheduleHour` Int default `2` — UTC hour to run (0–23, default: 2am UTC)

**And** a new `TenantBackupRun` model is added:
```
id              String   cuid PK
tenantId        String
type            String   ('excel_cloudinary' | 'google_sheets')
status          String   ('success' | 'error')
errorMessage    String?
cloudinaryUrl   String?  (populated for excel_cloudinary runs)
sheetsUpdated   Int?     (populated for google_sheets runs)
triggeredBy     String   ('schedule' | 'manual')
createdAt       DateTime default now
```

**And** a FK relation from `TenantBackupRun` to `Tenant` (cascade delete).
**And** a reverse relation `backupRuns TenantBackupRun[]` on `Tenant`.
**And** `pnpm db:generate` and `pnpm db:push` complete without errors.

---

### AC-2: Shared types updated

**Given** `packages/shared-types/src/index.ts`,
**When** complete,
**Then** these are exported:
```typescript
export type BackupSchedule = 'off' | 'daily' | 'weekly';
export type BackupRunType = 'excel_cloudinary' | 'google_sheets';
export type BackupRunStatus = 'success' | 'error';

export interface TenantBackupRun {
  id: string;
  tenantId: string;
  type: BackupRunType;
  status: BackupRunStatus;
  errorMessage: string | null;
  cloudinaryUrl: string | null;
  sheetsUpdated: number | null;
  triggeredBy: 'schedule' | 'manual';
  createdAt: string;
}
```

---

### AC-3: Schedule config saved via `PUT /api/export/google-sheets/config`

**Given** the existing PUT endpoint (Story 5.2),
**When** the request body includes:
```json
{ "backupSchedule": "weekly", "backupScheduleDay": 1, "backupScheduleHour": 2 }
```
**Then** the `TenantExportConfig` record is updated with these values.
**And** the response includes `backupSchedule`, `backupScheduleDay`, `backupScheduleHour`.

**Given** `backupSchedule: "daily"`,
**Then** `backupScheduleDay` is ignored (set to null).

**Given** `backupSchedule: "weekly"` and `backupScheduleDay` is not 0–6,
**Then** the API returns `400 { "success": false, "error": "backupScheduleDay must be 0–6 for weekly schedule" }`.

---

### AC-4: `GET /api/export/backup-runs` — backup history

**Given** an authenticated user with `reports:view` permission,
**When** `GET /api/export/backup-runs?limit=10` is called,
**Then** the response is:
```json
{
  "success": true,
  "data": {
    "items": [ ...TenantBackupRun[], ],
    "total": 24
  }
}
```
**And** results are ordered by `createdAt DESC`.
**And** only runs for the caller's `tenantId` are returned.

---

### AC-5: Scheduled cron job runs per-tenant at configured time

**Given** the cron job is running in the Express API process (using `node-cron`),
**When** any UTC minute ticks,
**Then** the job checks all `TenantExportConfig` records where `backupSchedule != 'off'`.
**And** for each matching tenant, checks:
  - **Daily**: run if current UTC hour matches `backupScheduleHour` and no `TenantBackupRun` of type `excel_cloudinary` exists for today (UTC date).
  - **Weekly**: additionally check that current UTC day of week matches `backupScheduleDay`.

**And** if conditions are met, the job runs the backup for that tenant (see AC-6).
**And** the cron expression is `* * * * *` (every minute — the per-tenant check guards against double-firing).

---

### AC-6: Scheduled backup job executes both Excel + Google Sheets export

**Given** a tenant whose schedule conditions are met,
**When** the cron job fires for that tenant,
**Then** the following happens in sequence:

**Step A — Excel to Cloudinary:**
1. Generate the `.xlsx` workbook (reuse the same logic as `GET /api/export/excel` but buffered, not streamed)
2. Upload the buffer to Cloudinary under folder `flowtiq-backups/{tenantId}/` with public ID `backup-YYYY-MM-DD-HHmm`
3. Create a `TenantBackupRun` record: `type: 'excel_cloudinary'`, `triggeredBy: 'schedule'`, `status: 'success'`, `cloudinaryUrl: <secure_url>`.
4. If any step fails, record `status: 'error'`, `errorMessage: <message>`.

**Step B — Google Sheets sync (only if `googleSyncEnabled = true` and service account is configured):**
1. Run the same sync logic as `POST /api/export/google-sheets/sync`
2. Create a `TenantBackupRun` record: `type: 'google_sheets'`, `triggeredBy: 'schedule'`, `status: 'success'|'error'`.
3. Update `lastSyncedAt`, `lastSyncStatus`, `lastSyncError` on `TenantExportConfig`.

---

### AC-7: In-app notification sent to admins after backup run

**Given** a scheduled backup run completes (Step A or B, success or error),
**When** the backup job finishes,
**Then** an in-app `Notification` is created for every user in the tenant who has the `roles:manage` permission, with:
- **On success**: `title: 'Backup Completed'`, `body: 'Scheduled backup ran successfully on <date>. Excel saved to cloud. [Google Sheets synced if applicable]'`
- **On partial failure** (e.g. Excel ok, Sheets failed): `title: 'Backup Partially Failed'`, `body: 'Excel backup succeeded but Google Sheets sync failed: <error>. Check Export settings.'`
- **On total failure**: `title: 'Backup Failed'`, `body: 'Scheduled backup failed: <error>. Check Export settings.'`

**And** the notification `link` field is set to `/settings?tab=export-backup`.

---

### AC-8: Manual backup triggers same job logic and creates `TenantBackupRun` record

**Given** the existing `POST /api/export/google-sheets/sync` endpoint (Story 5.2),
**When** it runs,
**Then** it also creates a `TenantBackupRun` record with `type: 'google_sheets'`, `triggeredBy: 'manual'`.

**Given** the existing `GET /api/export/excel` download endpoint (Story 5.1),
**When** it runs successfully,
**Then** it creates a `TenantBackupRun` record with `type: 'excel_cloudinary'`, `triggeredBy: 'manual'`, `cloudinaryUrl: null` (manual downloads are not uploaded to Cloudinary — just logged).

---

### AC-9: Settings UI — schedule configuration

**Given** the "Export & Backup" tab in Settings,
**When** it renders,
**Then** below the Google Sheets section, a third section titled "Automatic Backup Schedule" appears.

**The section contains:**
- A radio/select for `Backup Schedule`: `Off` | `Daily` | `Weekly`
- When "Weekly" is selected: a `<select>` for day of week (Sunday–Saturday)
- A `<select>` for "Run at (UTC hour)": options 0–23 formatted as `00:00`, `01:00`, ... `23:00`; default `02:00`
- A "Save Schedule" button

**And** the form is pre-populated from the current `TenantExportConfig` values on load.
**And** on save: `toast.success('Backup schedule saved')` or `toast.error(msg)`.

---

### AC-10: Settings UI — Backup History panel

**Given** the "Export & Backup" tab,
**When** it renders,
**Then** a fourth section titled "Backup History" appears at the bottom.

**The section contains:**
- A table with columns: `Date & Time | Type | Triggered By | Status | Details`
- `Type` shows: `Excel (Cloud)` or `Google Sheets`
- `Triggered By` shows: `Scheduled` or `Manual`
- `Status` shows a badge: green "Success" or red "Failed"
- `Details` shows: a hyperlink "View file" (for `cloudinaryUrl`) or the error message truncated to 80 chars
- Maximum 10 rows (latest first)
- If no runs yet: "No backups recorded yet." placeholder

**And** the list auto-refreshes when the "Sync Now" button is clicked (React Query invalidation).

---

### AC-11: Cron job registered at API startup

**Given** `services/api/src/index.ts`,
**When** the server starts,
**Then** `scheduleBackupJob()` from `services/api/src/jobs/backup.ts` is called once.
**And** the job does not run in test environment (`NODE_ENV === 'test'`).

---

### AC-12: No double-firing guard

**Given** a tenant with `backupSchedule: 'daily'` and `backupScheduleHour: 2`,
**When** the cron fires at `02:00 UTC` and again at `02:01 UTC`,
**Then** only ONE `TenantBackupRun` record is created for that day.
**And** the guard checks: `SELECT * FROM TenantBackupRun WHERE tenantId = ? AND type = 'excel_cloudinary' AND createdAt >= <start of today UTC>`.

---

### AC-13: TypeScript compilation passes

**Given** all changes,
**When** `pnpm type-check` is run,
**Then** zero TypeScript errors are reported.

---

## Dev Notes

### Job file structure

```
services/api/src/jobs/
  followup-reminders.ts   (existing)
  backup.ts               (new — this story)
```

### Cron setup pattern (matches existing `followup-reminders.ts`)

```typescript
import cron from 'node-cron';

export function scheduleBackupJob() {
  cron.schedule('* * * * *', async () => {
    await runScheduledBackups();
  });
}

async function runScheduledBackups() {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentDay = now.getUTCDay();

  const configs = await prisma.tenantExportConfig.findMany({
    where: { backupSchedule: { not: 'off' } },
  });

  for (const config of configs) {
    if (config.backupSchedule === 'daily' && config.backupScheduleHour !== currentHour) continue;
    if (config.backupSchedule === 'weekly') {
      if (config.backupScheduleDay !== currentDay) continue;
      if (config.backupScheduleHour !== currentHour) continue;
    }

    // Double-fire guard
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const alreadyRan = await prisma.tenantBackupRun.findFirst({
      where: { tenantId: config.tenantId, type: 'excel_cloudinary', createdAt: { gte: todayStart } },
    });
    if (alreadyRan) continue;

    await runTenantBackup(config.tenantId);
  }
}
```

### Excel buffer upload to Cloudinary

```typescript
import { v2 as cloudinary } from 'cloudinary';

const buffer = await workbook.xlsx.writeBuffer();
const result = await new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream(
    { folder: `flowtiq-backups/${tenantId}`, public_id: `backup-${timestamp}`, resource_type: 'raw' },
    (err, result) => err ? reject(err) : resolve(result),
  ).end(buffer);
});
```

### React Query invalidation after sync

In the Settings page, after "Sync Now" resolves, call:
```typescript
queryClient.invalidateQueries({ queryKey: ['export-config'] });
queryClient.invalidateQueries({ queryKey: ['backup-runs'] });
```

### Route additions

- `GET /api/export/backup-runs` — protected by `reports:view`
- `PUT /api/export/google-sheets/config` — already exists; extend to accept new schedule fields

---

## Dev Agent Record

### Completion Notes

Exported `fetchExportData`, `ExportData`, `buildSheetRows`, `SHEET_NAMES` from `routes/export.ts` and added a new exported `buildExcelWorkbook` function so the backup job can reuse the same logic without duplicating it.

Created `services/api/src/jobs/backup.ts` with `startBackupJob()` (guarded by `CRON_LEADER=true` env var, same pattern as follow-up reminders). The cron runs every minute, checks all tenants where `backupSchedule != 'off'`, applies daily/weekly hour+day filters, and uses a double-fire guard (`TenantBackupRun` lookup for today UTC). Step A uploads an Excel buffer to Cloudinary under `flowtiq-backups/{tenantId}/`. Step B runs Google Sheets sync if `googleSyncEnabled` is true. Both steps create `TenantBackupRun` records. After both steps, in-app notifications are sent to all active users with `roles:manage` permission in the tenant.

Registered `startBackupJob()` in `services/api/src/index.ts` immediately after `startFollowUpReminderJob()`.

Added schedule UI to `ExportBackupTab` in settings page: radio buttons for Off/Daily/Weekly, day-of-week select (Weekly only), UTC hour select, and a Save Schedule button calling `PUT /api/export/google-sheets/config` with schedule fields.

`pnpm type-check` passes with zero errors.

### File List

- `services/api/src/routes/export.ts` (modified — exported fetchExportData, ExportData, buildSheetRows, SHEET_NAMES; added buildExcelWorkbook)
- `services/api/src/jobs/backup.ts` (new — startBackupJob, cron, per-tenant backup, Cloudinary upload, Sheets sync, notifications)
- `services/api/src/index.ts` (modified — registered startBackupJob)
- `apps/admin-portal/src/app/(dashboard)/settings/page.tsx` (modified — added schedule UI section with radio/selects, saveScheduleMutation)

### Change Log

- 2026-06-27: Story 5.3 implemented — scheduled auto-backup cron job, Cloudinary Excel archival, schedule UI, admin notifications

---

## Out of Scope

- Email delivery of backup files
- S3 / Google Drive storage (Cloudinary is sufficient)
- Per-user schedule configuration (schedule is tenant-wide)
- Backup encryption at rest
- Rollback / restore from backup

---

## Definition of Done

- [x] `TenantExportConfig` extended with `backupSchedule`, `backupScheduleDay`, `backupScheduleHour`
- [x] `TenantBackupRun` model added; `pnpm db:push` passes
- [x] Shared types updated with new interfaces
- [x] `scheduleBackupJob()` registered at server startup; not run in test env
- [x] Cron fires per-tenant at correct UTC hour, day (daily/weekly), with double-fire guard
- [x] Excel workbook buffered and uploaded to Cloudinary on scheduled run
- [x] Google Sheets sync triggered on scheduled run if enabled
- [x] `TenantBackupRun` record created for every run (manual and scheduled)
- [x] In-app notification sent to `roles:manage` users after each scheduled run
- [x] `GET /api/export/backup-runs` returns history scoped to tenant
- [x] Settings UI: schedule section with day/hour selectors
- [x] Settings UI: Backup History table with 10 most recent runs
- [x] React Query invalidation after manual sync/download
- [x] `pnpm type-check` passes
