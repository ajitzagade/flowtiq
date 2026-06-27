import cron from 'node-cron';
import { google } from 'googleapis';
import prisma from '../lib/prisma';
import { uploadToCloudinary } from '../lib/storage';
import { fetchExportData, buildExcelWorkbook, buildSheetRows, SHEET_NAMES } from '../routes/export';

// ── Startup registration ───────────────────────────────────────────────────────

export function startBackupJob(): void {
  if (process.env.CRON_LEADER !== 'true') {
    console.log('Backup cron: CRON_LEADER not set — skipping on this instance');
    return;
  }
  cron.schedule('* * * * *', () => {
    runScheduledBackups().catch((err) => console.error('Backup job error:', err));
  });
  console.log('Backup cron registered (leader instance)');
}

// ── Core scheduler ─────────────────────────────────────────────────────────────

async function runScheduledBackups(): Promise<void> {
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

    // Double-fire guard: only one excel_cloudinary run per UTC day per tenant
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const alreadyRan = await prisma.tenantBackupRun.findFirst({
      where: { tenantId: config.tenantId, type: 'excel_cloudinary', createdAt: { gte: todayStart } },
    });
    if (alreadyRan) continue;

    runTenantBackup(config.tenantId, config.googleSyncEnabled).catch((err) =>
      console.error(`Backup failed for tenant ${config.tenantId}:`, err),
    );
  }
}

// ── Per-tenant backup ──────────────────────────────────────────────────────────

async function runTenantBackup(tenantId: string, googleSyncEnabled: boolean): Promise<void> {
  let excelStatus: 'success' | 'error' = 'success';
  let excelError = '';
  let sheetsStatus: 'success' | 'error' | null = null;
  let sheetsError = '';

  // Step A: Excel → Cloudinary
  try {
    const exportData = await fetchExportData(tenantId, false);
    const workbook = buildExcelWorkbook(exportData, false);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const { url: cloudinaryUrl } = await uploadToCloudinary(
      buffer,
      `flowtiq-backups/${tenantId}`,
      `backup-${timestamp}.xlsx`,
    );

    await prisma.tenantBackupRun.create({
      data: { tenantId, type: 'excel_cloudinary', status: 'success', cloudinaryUrl, triggeredBy: 'schedule' },
    });
  } catch (err) {
    excelStatus = 'error';
    excelError = err instanceof Error ? err.message : String(err);
    console.error(`Backup Excel step failed for tenant ${tenantId}:`, excelError);
    await prisma.tenantBackupRun.create({
      data: { tenantId, type: 'excel_cloudinary', status: 'error', errorMessage: excelError, triggeredBy: 'schedule' },
    }).catch(() => {});
  }

  // Step B: Google Sheets sync (only if enabled and config exists)
  if (googleSyncEnabled) {
    try {
      const config = await prisma.tenantExportConfig.findUnique({ where: { tenantId } });
      if (config?.googleServiceAccountJson && config?.googleSpreadsheetId) {
        const creds = JSON.parse(config.googleServiceAccountJson) as { client_email: string; private_key: string };
        const auth = new google.auth.JWT({
          email: creds.client_email,
          key: creds.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = config.googleSpreadsheetId;
        const exportData = await fetchExportData(tenantId, false);

        // Ensure all tabs exist
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingTitles = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''));
        const toCreate = SHEET_NAMES.filter((n) => !existingTitles.has(n));
        if (toCreate.length > 0) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
          });
        }

        // Clear + rewrite each tab
        for (const sheetName of SHEET_NAMES) {
          await sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName });
          const { headers, rows } = buildSheetRows(sheetName, exportData, false);
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [headers, ...rows] },
          });
        }

        await prisma.tenantExportConfig.update({
          where: { tenantId },
          data: { lastSyncedAt: new Date(), lastSyncStatus: 'success', lastSyncError: null },
        });

        sheetsStatus = 'success';
        await prisma.tenantBackupRun.create({
          data: { tenantId, type: 'google_sheets', status: 'success', sheetsUpdated: SHEET_NAMES.length, triggeredBy: 'schedule' },
        });
      }
    } catch (err) {
      sheetsStatus = 'error';
      sheetsError = err instanceof Error ? err.message : String(err);
      console.error(`Backup Sheets step failed for tenant ${tenantId}:`, sheetsError);
      await prisma.tenantExportConfig.update({
        where: { tenantId },
        data: { lastSyncedAt: new Date(), lastSyncStatus: 'error', lastSyncError: sheetsError },
      }).catch(() => {});
      await prisma.tenantBackupRun.create({
        data: { tenantId, type: 'google_sheets', status: 'error', errorMessage: sheetsError, triggeredBy: 'schedule' },
      }).catch(() => {});
    }
  }

  await sendBackupNotification(tenantId, excelStatus, excelError, sheetsStatus, sheetsError);
}

// ── Notification helper ────────────────────────────────────────────────────────

async function sendBackupNotification(
  tenantId: string,
  excelStatus: 'success' | 'error',
  excelError: string,
  sheetsStatus: 'success' | 'error' | null,
  sheetsError: string,
): Promise<void> {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let title: string;
  let body: string;

  if (excelStatus === 'error') {
    if (sheetsStatus === 'error') {
      title = 'Backup Failed';
      body = `Scheduled backup failed: ${excelError}. Check Export settings.`;
    } else {
      title = 'Backup Partially Failed';
      body = `Excel backup failed: ${excelError}. ${sheetsStatus === 'success' ? 'Google Sheets sync succeeded.' : ''} Check Export settings.`;
    }
  } else if (sheetsStatus === 'error') {
    title = 'Backup Partially Failed';
    body = `Excel backup succeeded but Google Sheets sync failed: ${sheetsError}. Check Export settings.`;
  } else {
    title = 'Backup Completed';
    const sheetsNote = sheetsStatus === 'success' ? ' Google Sheets synced.' : '';
    body = `Scheduled backup ran successfully on ${date}. Excel saved to cloud.${sheetsNote}`;
  }

  // Find all active users with the roles:manage permission in this tenant
  const manageUsers = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      userRoles: {
        some: {
          role: {
            rolePermissions: { some: { permission: { code: 'roles:manage' } } },
          },
        },
      },
    },
    select: { id: true },
  });

  await Promise.all(
    manageUsers.map((u) =>
      prisma.notification.create({
        data: {
          tenantId,
          userId: u.id,
          type: 'system',
          title,
          message: body,
          data: { link: '/settings?tab=export-backup' },
        },
      }),
    ),
  );
}
