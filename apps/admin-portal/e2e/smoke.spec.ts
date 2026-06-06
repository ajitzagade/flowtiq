/**
 * E2E Smoke Tests — Layer 3
 *
 * Run locally before deploying:
 *   pnpm --filter @flowtiq/admin-portal exec playwright test
 *
 * Against production:
 *   BASE_URL=https://flowtiq-admin.vercel.app pnpm --filter @flowtiq/admin-portal exec playwright test
 *
 * Credentials: admin@vastudeep.com / Admin@123 (seed data)
 */

import { test, expect } from '@playwright/test';

const EMAIL = 'admin@vastudeep.com';
const PASSWORD = 'Admin@123';

test.describe('Critical path smoke tests', () => {
  test('1. Login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test.describe('Authenticated', () => {
    // Login once, reuse auth state across tests in this describe block
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(EMAIL);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.getByRole('button', { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/dashboard/);
    });

    test('2. Dashboard shows project count', async ({ page }) => {
      await expect(page.locator('[data-testid="stat-card"]').first()).toBeVisible({ timeout: 10000 });
      // Total projects stat should be a number
      const stat = page.locator('[data-testid="stat-card"]').first();
      const text = await stat.textContent();
      expect(text).toMatch(/\d/);
    });

    test('3. Projects page loads with kanban columns', async ({ page }) => {
      await page.goto('/projects');
      await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
      // At least one kanban column should be visible
      await expect(page.locator('[data-stage-key]').first()).toBeVisible({ timeout: 10000 });
    });

    test('4. Project detail page shows stages', async ({ page }) => {
      await page.goto('/projects');
      // Click the first project card
      const firstCard = page.locator('[data-project-id]').first();
      await firstCard.waitFor({ timeout: 10000 });
      await firstCard.click();
      await page.waitForURL(/\/projects\/.+/);
      // Stages tab should show stage cards
      await expect(page.locator('[data-stage-card]').first()).toBeVisible({ timeout: 10000 });
    });

    test('5. Follow-ups page loads', async ({ page }) => {
      await page.goto('/follow-ups');
      await expect(page.getByRole('heading', { name: /follow.up/i })).toBeVisible();
    });
  });
});
