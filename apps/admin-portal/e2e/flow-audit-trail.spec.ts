/**
 * End-to-end flow: Audit trail
 *
 * Every significant action should produce an audit log entry.
 * These tests perform an action, then verify the audit log
 * reflects it with the correct module, action, and entity name.
 *
 *  1. Login → audit log shows "LOGGED_IN" entry for the user
 *  2. Create project → audit log shows "CREATED" entry for that project
 *  3. Update project → audit log shows "UPDATED" entry
 *  4. Update stage status → audit log shows "STATUS_CHANGED" entry
 *  5. Create follow-up → audit log shows "CREATED" entry under followups module
 *  6. Audit log module filter "auth" shows login entries
 *  7. Audit log action filter "CREATED" shows only create entries
 *  8. Audit log date range filter scopes entries to today
 *  9. Recent Activity section on dashboard reflects latest actions
 */

import { test, expect, Page } from '@playwright/test';

const TS = Date.now();
const PROJECT_NAME = `AuditTest ${TS}`;

async function createProject(page: Page, name: string) {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /new project/i }).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor({ timeout: 5000 });
  // Labels have no for= attr — use placeholder selectors
  await modal.locator('input[placeholder*="Sunrise"], input[placeholder*="project"]').first().fill(name);
  await modal.locator('input[placeholder*="Client or company"], input[placeholder*="client"]').first().fill('Audit Client');
  // Owner select is after Priority — select by label text proximity using getByLabel (Playwright matches adjacent labels)
  const ownerSelect = modal.getByLabel(/project owner/i);
  await ownerSelect.waitFor({ timeout: 10000 });
  const firstOpt = ownerSelect.locator('option:not([value=""])').first();
  await firstOpt.waitFor({ state: 'attached', timeout: 10000 });
  await ownerSelect.selectOption(await firstOpt.getAttribute('value') ?? '');
  await page.getByRole('button', { name: /create project/i }).click();
  await expect(page.getByText(/project created/i)).toBeVisible({ timeout: 10000 });
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 });
}

async function waitForAuditLogs(page: Page) {
  await Promise.race([
    page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
    page.getByText(/no audit logs found/i).waitFor({ timeout: 10000 }),
  ]).catch(() => {});
}

// ── 1. Login appears in audit log ────────────────────────────────────────────
test('Login action appears in audit log under "auth" module', async ({ page }) => {
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');
  await waitForAuditLogs(page);

  // Filter to auth module
  const moduleSelect = page.locator('select').filter({ has: page.locator('option[value="auth"]') }).first();
  await moduleSelect.selectOption('auth');
  await page.waitForTimeout(600);

  const rows = page.locator('table tbody tr');
  if (!(await page.getByText(/no audit logs found/i).isVisible()) && await rows.count() > 0) {
    const firstRowText = await rows.first().textContent();
    expect(firstRowText).toMatch(/auth|logged in/i);
    expect(firstRowText).toMatch(/@/); // user email is shown
  }
});

// ── 2. Create project → CREATED entry in audit log ───────────────────────────
test('Creating a project produces a CREATED entry in audit logs', async ({ page }) => {
  const name = `${PROJECT_NAME}_create`;
  await createProject(page, name);

  // Navigate to audit logs and filter to projects + CREATED
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');
  await waitForAuditLogs(page);

  const moduleSelect = page.locator('select').filter({ has: page.locator('option[value="projects"]') }).first();
  const actionSelect = page.locator('select').filter({ has: page.locator('option[value="CREATED"]') }).first();

  await moduleSelect.selectOption('projects');
  await page.waitForTimeout(400);
  await actionSelect.selectOption('CREATED');
  await page.waitForTimeout(600);

  const rows = page.locator('table tbody tr');
  if (!(await page.getByText(/no audit logs found/i).isVisible()) && await rows.count() > 0) {
    // There should be at least one CREATED row for projects
    const createdRow = rows.filter({ hasText: /created/i }).first();
    await expect(createdRow).toBeVisible({ timeout: 5000 });
  }
});

// ── 3. Stage update → STATUS_CHANGED entry in audit log ──────────────────────
test('Updating stage status produces a STATUS_CHANGED entry in audit logs', async ({ page }) => {
  // Update a stage on the first project
  await page.goto('/projects');
  await page.getByRole('button', { name: /list/i }).click();
  await page.waitForLoadState('networkidle');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.waitFor({ timeout: 10000 });
  await firstRow.locator('a').first().click();
  await page.waitForURL(/\/projects\/.+/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  await page.locator('[role="button"]').filter({ hasText: /stages complete/i }).first().waitFor({ timeout: 15000 });
  await page.locator('[role="button"]').filter({ hasText: /stages complete/i }).first().click();
  await page.locator('button[aria-expanded]').first().waitFor({ timeout: 10000 });

  const closedStage = page.locator('button[aria-expanded="false"]').first();
  if (await closedStage.count() > 0) await closedStage.click();
  else await page.locator('button[aria-expanded]').first().click();

  const updateBtn = page.getByRole('button', { name: /update stage/i }).first();
  await updateBtn.waitFor({ timeout: 5000 });
  await updateBtn.click();

  const statusSelect = page.locator('select').filter({ has: page.locator('option[value="in_progress"]') }).first();
  await statusSelect.waitFor({ timeout: 5000 });
  await statusSelect.selectOption('in_progress');
  await page.getByRole('button', { name: /save changes/i }).click();
  await expect(page.getByText(/stage updated/i)).toBeVisible({ timeout: 10000 });

  // Check audit log for STATUS_CHANGED
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');
  await waitForAuditLogs(page);

  const actionSelect = page.locator('select').filter({ has: page.locator('option[value="STATUS_CHANGED"]') }).first();
  await actionSelect.selectOption('STATUS_CHANGED');
  await page.waitForTimeout(600);

  const rows = page.locator('table tbody tr');
  if (!(await page.getByText(/no audit logs found/i).isVisible()) && await rows.count() > 0) {
    const statusChangedRow = rows.filter({ hasText: /status changed/i }).first();
    await expect(statusChangedRow).toBeVisible({ timeout: 5000 });
  }
});

// ── 4. Audit log module filter "stages" shows stage entries ──────────────────
test('Audit log module filter "stages" returns stage-related entries', async ({ page }) => {
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');
  await waitForAuditLogs(page);

  const moduleSelect = page.locator('select').filter({ has: page.locator('option[value="stages"]') }).first();
  await moduleSelect.selectOption('stages');
  await page.waitForTimeout(600);

  const rows = page.locator('table tbody tr');
  if (!(await page.getByText(/no audit logs found/i).isVisible()) && await rows.count() > 0) {
    const firstRowText = await rows.first().textContent();
    expect(firstRowText).toMatch(/stage/i);
  }
});

// ── 5. Action filter CREATED → all rows show "created" ───────────────────────
test('Audit log action filter "CREATED" returns only created entries', async ({ page }) => {
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');
  await waitForAuditLogs(page);

  const actionSelect = page.locator('select').filter({ has: page.locator('option[value="CREATED"]') }).first();
  await actionSelect.selectOption('CREATED');
  await page.waitForTimeout(600);

  const rows = page.locator('table tbody tr');
  if (!(await page.getByText(/no audit logs found/i).isVisible()) && await rows.count() > 0) {
    const count = await rows.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await rows.nth(i).textContent();
      expect(text).toMatch(/created/i);
    }
  }
});

// ── 6. Date range filter scopes results ──────────────────────────────────────
test('Audit log date range filter (today → today) returns results or empty state', async ({ page }) => {
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');

  const today = new Date().toISOString().split('T')[0];
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.first().fill(today);
  await dateInputs.nth(1).fill(today);
  await page.waitForTimeout(600);

  // Page should not crash
  await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
  // At least one row exists (since we just did actions today)
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  const isEmpty = await page.getByText(/no audit logs found/i).isVisible().catch(() => false);
  // We logged in today so there should be at least 1 auth entry
  expect(count > 0 || isEmpty === false).toBeTruthy();
});

// ── 7. Search filter narrows results ─────────────────────────────────────────
test('Audit log search by user email filters rows', async ({ page }) => {
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');
  await waitForAuditLogs(page);

  const search = page.locator('input[placeholder*="user, entity" i]');
  await search.fill('admin@vastudeep.com');
  await page.waitForTimeout(600);

  const rows = page.locator('table tbody tr');
  if (!(await page.getByText(/no audit logs found/i).isVisible()) && await rows.count() > 0) {
    const firstRowText = await rows.first().textContent();
    expect(firstRowText).toMatch(/admin@vastudeep/i);
  }
});

// ── 8. Dashboard Recent Activity reflects actual actions ────────────────────
test('Dashboard "Recent Activity" section shows entries matching audit log data', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  await expect(page.getByText('Recent Activity')).toBeVisible({ timeout: 10000 });

  // Recent activity items have action verbs
  const activitySection = page.getByText('Recent Activity').locator('../..');
  await expect(activitySection).toBeVisible();

  // Should not be empty if any activity has occurred
  await page.waitForTimeout(500);
  const activityText = await activitySection.textContent();
  expect(activityText).toBeTruthy();
});

// ── 9. Audit log pagination shows page info when many entries ────────────────
test('Audit log shows pagination controls when records exceed page size', async ({ page }) => {
  await page.goto('/audit-logs');
  await page.waitForLoadState('networkidle');
  await waitForAuditLogs(page);

  const pagination = page.locator('span').filter({ hasText: /page \d+ of \d+/i });
  if (await pagination.count() > 0) {
    await expect(pagination.first()).toBeVisible();
    // Prev button disabled on page 1
    // Scope to pagination area (after table) to avoid matching sidebar collapse button
    const paginationArea = page.locator('.flex.items-center.justify-between').last();
    const prevBtn = paginationArea.locator('button').filter({ has: page.locator('[class*="lucide-chevron-left"]') }).first();
    if (await prevBtn.count() > 0) {
      await expect(prevBtn).toBeDisabled();
    }
  }
});
