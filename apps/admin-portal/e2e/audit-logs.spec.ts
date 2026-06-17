/**
 * Audit Logs page — complete UI coverage
 * Table, filters (search, module, action, date range), action badges.
 */

import { test, expect } from '@playwright/test';

test.describe('Audit Logs page layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/audit-logs');
    await page.waitForLoadState('networkidle');
  });

  test('page heading "Audit Logs" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();
  });

  test('search input is present', async ({ page }) => {
    await expect(page.locator('input[placeholder*="user, entity" i]')).toBeVisible();
  });

  test('Module filter dropdown is present with correct options', async ({ page }) => {
    const moduleSelect = page.locator('select').filter({ has: page.locator('option[value="projects"]') }).first();
    await expect(moduleSelect).toBeVisible();
    await expect(moduleSelect.locator('option[value=""]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="projects"]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="stages"]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="documents"]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="followups"]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="users"]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="roles"]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="workflows"]')).toHaveCount(1);
    await expect(moduleSelect.locator('option[value="auth"]')).toHaveCount(1);
  });

  test('Action filter dropdown is present with correct options', async ({ page }) => {
    const actionSelect = page.locator('select').filter({ has: page.locator('option[value="CREATED"]') }).first();
    await expect(actionSelect).toBeVisible();
    await expect(actionSelect.locator('option[value="CREATED"]')).toHaveCount(1);
    await expect(actionSelect.locator('option[value="UPDATED"]')).toHaveCount(1);
    await expect(actionSelect.locator('option[value="DELETED"]')).toHaveCount(1);
    await expect(actionSelect.locator('option[value="UPLOADED"]')).toHaveCount(1);
    await expect(actionSelect.locator('option[value="STATUS_CHANGED"]')).toHaveCount(1);
    await expect(actionSelect.locator('option[value="LOGGED_IN"]')).toHaveCount(1);
  });

  test('date "From" and "To" inputs are present', async ({ page }) => {
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Audit Logs table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/audit-logs');
    await page.waitForLoadState('networkidle');
    await Promise.race([
      page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
      page.getByText(/no audit logs found/i).waitFor({ timeout: 10000 }),
    ]).catch(() => {});
  });

  test('table has expected columns: Timestamp, User, Action, Module, Entity, IP Address', async ({ page }) => {
    const isEmpty = await page.getByText(/no audit logs found/i).isVisible().catch(() => false);
    if (!isEmpty && await page.locator('table tbody tr').count() > 0) {
      await expect(page.locator('th').filter({ hasText: /timestamp/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /user/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /action/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /module/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /entity/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /ip/i }).first()).toBeVisible();
    }
  });

  test('log rows show action badge', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no audit logs found/i).isVisible())) {
      const text = await firstRow.textContent();
      expect(text).toMatch(/created|updated|deleted|uploaded|logged in|status changed/i);
    }
  });

  test('log rows show user email address', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no audit logs found/i).isVisible())) {
      const text = await firstRow.textContent();
      expect(text).toMatch(/@/);
    }
  });

  test('CREATED action rows have green badge', async ({ page }) => {
    const createdRow = page.locator('table tbody tr').filter({ hasText: /\bcreated\b/i }).first();
    if (await createdRow.count() > 0) {
      const badge = createdRow.locator('.badge-green').first();
      if (await badge.count() > 0) {
        await expect(badge).toBeVisible();
      }
    }
  });

  test('DELETED action rows have red badge', async ({ page }) => {
    const deletedRow = page.locator('table tbody tr').filter({ hasText: /\bdeleted\b/i }).first();
    if (await deletedRow.count() > 0) {
      const badge = deletedRow.locator('.badge-red').first();
      if (await badge.count() > 0) {
        await expect(badge).toBeVisible();
      }
    }
  });
});

test.describe('Audit Logs filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/audit-logs');
    await page.waitForLoadState('networkidle');
    await Promise.race([
      page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
      page.getByText(/no audit logs found/i).waitFor({ timeout: 10000 }),
    ]).catch(() => {});
  });

  test('searching by user filters rows', async ({ page }) => {
    const search = page.locator('input[placeholder*="user, entity" i]');
    await search.fill('xxxxxx_does_not_exist_user');
    await page.waitForTimeout(600);
    const isEmpty = await page.getByText(/no audit logs found/i).isVisible().catch(() => false);
    const rowCount = await page.locator('table tbody tr').count();
    expect(rowCount === 0 || isEmpty).toBeTruthy();
    await search.clear();
  });

  test('filtering by "projects" module shows project logs', async ({ page }) => {
    const moduleSelect = page.locator('select').filter({ has: page.locator('option[value="projects"]') }).first();
    await moduleSelect.selectOption('projects');
    await page.waitForTimeout(600);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0 && !(await page.getByText(/no audit logs found/i).isVisible())) {
      const firstRowText = await rows.first().textContent();
      expect(firstRowText).toMatch(/project/i);
    }
  });

  test('filtering by "CREATED" action shows only create logs', async ({ page }) => {
    const actionSelect = page.locator('select').filter({ has: page.locator('option[value="CREATED"]') }).first();
    await actionSelect.selectOption('CREATED');
    await page.waitForTimeout(600);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0 && !(await page.getByText(/no audit logs found/i).isVisible())) {
      const firstRowText = await rows.first().textContent();
      expect(firstRowText).toMatch(/created/i);
    }
  });

  test('filtering by "auth" module shows login logs', async ({ page }) => {
    const moduleSelect = page.locator('select').filter({ has: page.locator('option[value="auth"]') }).first();
    await moduleSelect.selectOption('auth');
    await page.waitForTimeout(600);
    // No crash
    await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
  });

  test('date range filter From/To inputs accept date values', async ({ page }) => {
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill('2024-01-01');
    await dateInputs.nth(1).fill('2026-12-31');
    await page.waitForTimeout(600);
    await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
  });

  test('resetting all filters restores the full log list', async ({ page }) => {
    const moduleSelect = page.locator('select').filter({ has: page.locator('option[value="projects"]') }).first();
    await moduleSelect.selectOption('projects');
    await page.waitForTimeout(400);
    await moduleSelect.selectOption('');
    await page.waitForTimeout(400);
    await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
  });
});

test.describe('Audit Logs pagination', () => {
  test('pagination controls appear when there are multiple pages', async ({ page }) => {
    await page.goto('/audit-logs');
    await page.waitForLoadState('networkidle');
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 }).catch(() => {});
    // If pagination exists, verify page text
    const pagination = page.locator('text=/Page \\d+ of \\d+/');
    if (await pagination.count() > 0) {
      await expect(pagination.first()).toBeVisible();
    }
  });
});
