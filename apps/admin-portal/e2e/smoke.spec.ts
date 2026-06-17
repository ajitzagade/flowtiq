/**
 * Smoke tests — critical path sanity checks.
 * Auth state loaded via storageState (playwright.config.ts + auth.setup.ts).
 */

import { test, expect } from '@playwright/test';

test('dashboard loads with stat cards', async ({ page }) => {
  await page.goto('/dashboard');
  // Stat cards render with className="stat-card", no data-testid attribute
  await expect(page.locator('.stat-card').first()).toBeVisible({ timeout: 10000 });
});

test('projects page loads with kanban columns', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
  await expect(page.locator('[data-stage-key]').first()).toBeVisible({ timeout: 10000 });
});

test('project detail page shows workflow cards', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: /list/i }).click();
  await page.waitForLoadState('networkidle');
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.waitFor({ timeout: 10000 });
  await firstRow.locator('a').first().click();
  await page.waitForURL(/\/projects\/.+/);
  await expect(page.locator('[role="button"]').filter({ hasText: /stages complete/i }).first()).toBeVisible({ timeout: 15000 });
});

test('follow-ups page loads', async ({ page }) => {
  await page.goto('/follow-ups');
  await expect(page.getByRole('heading', { name: /follow.up/i })).toBeVisible();
});

test('users page loads', async ({ page }) => {
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
});

test('roles page loads', async ({ page }) => {
  await page.goto('/roles');
  await expect(page.getByRole('heading', { name: /roles/i })).toBeVisible();
});

test('sidebar navigation is visible', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('navigation', { name: /main navigation/i })).toBeVisible();
});

test('notifications page loads', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible();
});

test('documents page loads', async ({ page }) => {
  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: /documents/i })).toBeVisible();
});

test('workflows page loads', async ({ page }) => {
  await page.goto('/workflows');
  await expect(page.getByRole('heading', { name: /workflows/i })).toBeVisible();
});

test('audit logs page loads', async ({ page }) => {
  await page.goto('/audit-logs');
  await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
});

test('settings page loads', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
});

test('reports page loads', async ({ page }) => {
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible();
});
