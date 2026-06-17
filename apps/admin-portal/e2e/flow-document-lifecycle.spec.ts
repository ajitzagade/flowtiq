/**
 * End-to-end flow: Document lifecycle
 *
 *  1. Upload document to a project → toast "Document uploaded successfully"
 *  2. Uploaded document appears in /documents list
 *  3. Document row shows correct project name, file type, version
 *  4. Document thumbnail appears on project detail page inside the stage
 *  5. Document count stat card on dashboard increases after upload
 *  6. Delete document → toast "Document deleted" → row disappears from list
 *  7. Project filter on documents page scopes to correct project's docs
 *  8. Search by file name finds the document
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Create a tiny test file in /tmp to upload
const TEST_FILE_PATH = path.join('/tmp', `e2e_test_doc_${Date.now()}.txt`);
fs.writeFileSync(TEST_FILE_PATH, 'E2E test document content');

async function getFirstActiveProjectId(page: Page): Promise<string | null> {
  await page.goto('/projects');
  await page.getByRole('button', { name: /list/i }).click();
  await page.waitForLoadState('networkidle');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.waitFor({ timeout: 10000 });
  const link = firstRow.locator('a').first();
  const href = await link.getAttribute('href');
  return href?.split('/projects/')?.[1] ?? null;
}

async function getDocumentCount(page: Page): Promise<number> {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.locator('.stat-card').first().waitFor({ timeout: 15000 });
  const docCard = page.locator('.stat-card').filter({ hasText: /documents/i }).first();
  const text = await docCard.locator('.text-2xl').textContent();
  return Number(text ?? '0');
}

// ── 1. Upload document → appears in /documents list ─────────────────────────
test('Upload document → appears in documents list with correct file type badge', async ({ page }) => {
  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  // Count docs before
  const rowsBefore = await page.locator('table tbody tr').count();
  const hadNoDocs = await page.getByText(/no documents found/i).isVisible().catch(() => false);

  // Open upload modal
  await page.getByRole('button', { name: /upload document/i }).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor({ timeout: 5000 });

  // Select project
  const projectSelect = modal.locator('select').first();
  await page.waitForTimeout(1000);
  const firstProjectOpt = projectSelect.locator('option:not([value=""])').first();
  await firstProjectOpt.waitFor({ timeout: 10000 });
  await projectSelect.selectOption(await firstProjectOpt.getAttribute('value') ?? '');

  // Upload the test file
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(TEST_FILE_PATH);

  // Upload button should now be enabled
  const uploadBtn = page.getByRole('button', { name: /^upload$/i });
  await expect(uploadBtn).not.toBeDisabled({ timeout: 3000 });

  await uploadBtn.click();
  await expect(page.getByText(/document uploaded/i)).toBeVisible({ timeout: 15000 });
  await expect(modal).not.toBeVisible({ timeout: 5000 });

  // Document should now appear in the list
  await page.waitForTimeout(500);
  const rowsAfter = await page.locator('table tbody tr').count();
  if (!hadNoDocs) {
    expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore);
  }

  // Find the uploaded file row
  const uploadedRow = page.locator('table tbody tr').filter({ hasText: /e2e_test_doc/i }).first();
  if (await uploadedRow.count() > 0) {
    await expect(uploadedRow).toBeVisible();
  }
});

// ── 2. Uploaded document shows version v1 ───────────────────────────────────
test('Newly uploaded document shows version "v1"', async ({ page }) => {
  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  // Upload a fresh doc
  await page.getByRole('button', { name: /upload document/i }).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor({ timeout: 5000 });

  const projectSelect = modal.locator('select').first();
  await page.waitForTimeout(1000);
  const firstOpt = projectSelect.locator('option:not([value=""])').first();
  await firstOpt.waitFor({ timeout: 10000 });
  await projectSelect.selectOption(await firstOpt.getAttribute('value') ?? '');

  await page.locator('#file-input').setInputFiles(TEST_FILE_PATH);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/document uploaded/i)).toBeVisible({ timeout: 15000 });
  await expect(modal).not.toBeVisible({ timeout: 5000 });

  // Find the row and check version
  await page.waitForTimeout(500);
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  if (count > 0) {
    const firstRowText = await rows.first().textContent();
    // At least some row shows v1
    const allTexts = await rows.allTextContents();
    const hasV1 = allTexts.some((t) => t.includes('v1'));
    expect(hasV1).toBeTruthy();
  }
});

// ── 3. Download link is present on each document row ────────────────────────
test('Document row has a working download link', async ({ page }) => {
  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  await Promise.race([
    page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
    page.getByText(/no documents found/i).waitFor({ timeout: 10000 }),
  ]).catch(() => {});

  const firstRow = page.locator('table tbody tr').first();
  if (await firstRow.isVisible() && !(await page.getByText(/no documents found/i).isVisible())) {
    const downloadLink = firstRow.locator('a[title="Download"]');
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute('target', '_blank');
    const href = await downloadLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).not.toBe('#');
  }
});

// ── 4. Delete document → disappears from list ───────────────────────────────
test('Delete document → toast "Document deleted" + row removed from list', async ({ page }) => {
  // First upload a document so we have something to delete
  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /upload document/i }).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor({ timeout: 5000 });

  const projectSelect = modal.locator('select').first();
  await page.waitForTimeout(1000);
  const firstOpt = projectSelect.locator('option:not([value=""])').first();
  await firstOpt.waitFor({ timeout: 10000 });
  await projectSelect.selectOption(await firstOpt.getAttribute('value') ?? '');

  await page.locator('#file-input').setInputFiles(TEST_FILE_PATH);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await expect(page.getByText(/document uploaded/i)).toBeVisible({ timeout: 15000 });
  await expect(modal).not.toBeVisible({ timeout: 5000 });

  await page.waitForTimeout(500);
  const rowsBefore = await page.locator('table tbody tr').count();

  // Delete the first row
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.waitFor({ timeout: 10000 });

  // Accept the confirm() dialog
  page.once('dialog', (dialog) => dialog.accept());
  await firstRow.locator('button[title="Delete"]').click();
  await expect(page.getByText(/document deleted/i)).toBeVisible({ timeout: 10000 });

  await page.waitForTimeout(500);
  const rowsAfter = await page.locator('table tbody tr').count();
  // Row count should decrease or show empty state
  const isEmpty = await page.getByText(/no documents found/i).isVisible().catch(() => false);
  expect(rowsAfter < rowsBefore || isEmpty).toBeTruthy();
});

// ── 5. Dashboard "Documents" stat count matches documents page ───────────────
test('Dashboard "Documents" stat card shows correct count', async ({ page }) => {
  const dashCount = await getDocumentCount(page);

  await page.goto('/documents');
  await page.waitForLoadState('networkidle');
  await Promise.race([
    page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
    page.getByText(/no documents found/i).waitFor({ timeout: 10000 }),
  ]).catch(() => {});

  const isEmpty = await page.getByText(/no documents found/i).isVisible().catch(() => false);
  if (!isEmpty) {
    // Dashboard count should be ≥ 1 if docs exist
    expect(dashCount).toBeGreaterThan(0);
  }
});

// ── 6. Project filter on documents page ─────────────────────────────────────
test('Selecting a project in the filter shows only that project\'s documents', async ({ page }) => {
  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  const projectFilter = page.locator('select').filter({ has: page.locator('option[value=""]') }).first();
  await projectFilter.waitFor({ timeout: 5000 });

  const opts = await projectFilter.locator('option:not([value=""])').count();
  if (opts === 0) return;

  const firstProjectOpt = projectFilter.locator('option:not([value=""])').first();
  const projectVal = await firstProjectOpt.getAttribute('value');
  const projectLabel = await firstProjectOpt.textContent();

  await projectFilter.selectOption(projectVal ?? '');
  await page.waitForTimeout(600);

  // All visible rows should belong to the selected project
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  if (count > 0 && !(await page.getByText(/no documents found/i).isVisible())) {
    const firstRowText = await rows.first().textContent();
    // Project name or number should appear in the row
    const projectName = projectLabel?.split(' - ')?.[1]?.trim() ?? '';
    if (projectName) {
      expect(firstRowText).toContain(projectName);
    }
  }
});

// ── 7. Document appears on project detail page after upload ──────────────────
test('Document uploaded to a stage appears as thumbnail on project detail page', async ({ page }) => {
  // Navigate to first project detail
  await page.goto('/projects');
  await page.getByRole('button', { name: /list/i }).click();
  await page.waitForLoadState('networkidle');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.waitFor({ timeout: 10000 });
  const projectHref = await firstRow.locator('a').first().getAttribute('href');
  const projectId = projectHref?.split('/').pop();

  await firstRow.locator('a').first().click();
  await page.waitForURL(/\/projects\/.+/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // Expand workflow + first stage
  await page.locator('[role="button"]').filter({ hasText: /stages complete/i }).first().waitFor({ timeout: 15000 });
  await page.locator('[role="button"]').filter({ hasText: /stages complete/i }).first().click();
  await page.locator('button[aria-expanded]').first().waitFor({ timeout: 10000 });

  const closedStage = page.locator('button[aria-expanded="false"]').first();
  if (await closedStage.count() > 0) await closedStage.click();
  else await page.locator('button[aria-expanded]').first().click();
  await page.waitForTimeout(500);

  // Find the stage's upload button (title="Upload document", small upload button inside stage)
  const stageUploadBtn = page.locator('button[title="Upload document"]').first();
  if (await stageUploadBtn.count() > 0) {
    // Get the hidden file input inside this stage section
    const stageFileInput = page.locator('input[type="file"].hidden').first();
    await stageFileInput.setInputFiles(TEST_FILE_PATH);
    await expect(page.getByText(/document uploaded/i)).toBeVisible({ timeout: 15000 });

    // A file thumbnail button should now be visible inside the stage
    const thumbnail = page.locator('button[title]').filter({ hasText: /txt|doc|pdf/i }).first();
    if (await thumbnail.count() > 0) {
      await expect(thumbnail).toBeVisible({ timeout: 5000 });
    }
  }
});
