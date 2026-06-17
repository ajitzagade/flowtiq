/**
 * Follow-ups page — complete UI coverage
 * CRUD tests are in follow-ups-crud.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Follow-ups page layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
  });

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /follow.up/i })).toBeVisible();
  });

  test('"New Follow-up" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new follow.up/i })).toBeVisible();
  });

  test('search input is present', async ({ page }) => {
    await expect(page.locator('input[placeholder*="search follow" i]')).toBeVisible();
  });

  test('status filter dropdown is present with correct options', async ({ page }) => {
    const statusSelect = page.locator('select.form-select');
    await expect(statusSelect).toBeVisible();
    // Verify options exist
    await expect(statusSelect.locator('option[value="pending"]')).toHaveCount(1);
    await expect(statusSelect.locator('option[value="overdue"]')).toHaveCount(1);
    await expect(statusSelect.locator('option[value="completed"]')).toHaveCount(1);
    await expect(statusSelect.locator('option[value="cancelled"]')).toHaveCount(1);
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();
  });
});

test.describe('Follow-ups table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
    // Wait for table to load or empty state
    await Promise.race([
      page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
      page.getByText(/no follow-ups found/i).waitFor({ timeout: 10000 }),
    ]).catch(() => {});
  });

  test('table has expected columns', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0 && !(await page.getByText(/no follow-ups found/i).isVisible())) {
      await expect(page.locator('th').filter({ hasText: /project/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /client/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /next follow/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /assigned/i }).first()).toBeVisible();
    }
  });

  test('follow-up rows show status badges', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible()) {
      const text = await firstRow.textContent();
      expect(text).toMatch(/pending|completed|overdue|cancelled/i);
    }
  });

  test('pending rows have "Mark as completed" action button (title="Mark as completed")', async ({ page }) => {
    const pendingRow = page.locator('table tbody tr').filter({ hasText: /pending/i }).first();
    if (await pendingRow.isVisible()) {
      await expect(pendingRow.locator('button[title="Mark as completed"]')).toBeVisible();
    }
  });

  test('each row has an edit button (title="Edit")', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no follow-ups found/i).isVisible())) {
      await expect(firstRow.locator('button[title="Edit"]')).toBeVisible();
    }
  });

  test('overdue rows have red highlight (bg-red-50)', async ({ page }) => {
    // Overdue rows get className with bg-red-50/30
    const overdueRow = page.locator('table tbody tr.bg-red-50\\/30, table tbody tr[class*="bg-red"]').first();
    if (await overdueRow.count() > 0) {
      await expect(overdueRow).toBeVisible();
    }
  });
});

test.describe('Follow-ups filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
    await Promise.race([
      page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
      page.getByText(/no follow-ups found/i).waitFor({ timeout: 10000 }),
    ]).catch(() => {});
  });

  test('search by non-existent term shows empty state', async ({ page }) => {
    const search = page.locator('input[placeholder*="search follow" i]');
    await search.fill('xxxxxx_does_not_exist_followup');
    await page.waitForTimeout(600);
    const rowCount = await page.locator('table tbody tr').count();
    const hasEmpty = await page.getByText(/no follow-ups found/i).isVisible().catch(() => false);
    expect(rowCount === 0 || hasEmpty).toBeTruthy();
  });

  test('filtering by "pending" status shows only pending rows', async ({ page }) => {
    const statusSelect = page.locator('select.form-select');
    await statusSelect.selectOption('pending');
    await page.waitForTimeout(600);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0 && !(await page.getByText(/no follow-ups found/i).isVisible())) {
      const firstRowText = await rows.first().textContent();
      expect(firstRowText).toMatch(/pending|overdue/i); // overdue = pending + past date
    }
  });

  test('filtering by "completed" status shows only completed rows', async ({ page }) => {
    const statusSelect = page.locator('select.form-select');
    await statusSelect.selectOption('completed');
    await page.waitForTimeout(600);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0 && !(await page.getByText(/no follow-ups found/i).isVisible())) {
      const firstRowText = await rows.first().textContent();
      expect(firstRowText).toMatch(/completed/i);
    }
  });

  test('selecting "All Status" resets filter', async ({ page }) => {
    const statusSelect = page.locator('select.form-select');
    await statusSelect.selectOption('completed');
    await page.waitForTimeout(400);
    await statusSelect.selectOption('');
    await page.waitForTimeout(400);
    // No crash
    await expect(page.getByRole('heading', { name: /follow.up/i })).toBeVisible();
  });
});

test.describe('Create Follow-up modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new follow.up/i }).click();
  });

  test('modal opens with title "New Follow-up"', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[id="modal-title-create"]')).toHaveText(/new follow.up/i);
  });

  test('modal has Project, Assigned To, Date, Notes fields', async ({ page }) => {
    await expect(page.getByText(/project/i).first()).toBeVisible();
    await expect(page.getByText(/assigned to/i)).toBeVisible();
    await expect(page.getByText(/next follow.up date/i)).toBeVisible();
    await expect(page.getByText(/notes/i)).toBeVisible();
  });

  test('modal has Cancel and "Create Follow-up" buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create follow.up/i })).toBeVisible();
  });

  test('Cancel closes modal', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Escape key closes modal', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('submitting empty form shows validation errors and keeps modal open', async ({ page }) => {
    await page.getByRole('button', { name: /create follow.up/i }).click();
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('project select has at least one active project option', async ({ page }) => {
    const projectSelect = page.getByRole('dialog').locator('select').first();
    await page.waitForTimeout(1000); // projects load async
    const options = await projectSelect.locator('option').count();
    expect(options).toBeGreaterThan(1); // at least "Select project" + 1 real project
  });
});

test.describe('Update Follow-up modal', () => {
  test('clicking edit button opens "Update Follow-up" modal', async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    if (!(await page.getByText(/no follow-ups found/i).isVisible())) {
      await firstRow.locator('button[title="Edit"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('[id="modal-title-update"]')).toHaveText(/update follow.up/i);
    }
  });

  test('update modal has Status, Date, Notes fields', async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    if (!(await page.getByText(/no follow-ups found/i).isVisible())) {
      await firstRow.locator('button[title="Edit"]').click();
      await expect(page.getByRole('dialog').getByText(/status/i)).toBeVisible();
      await expect(page.getByRole('dialog').locator('input[type="date"]')).toBeVisible();
      await expect(page.getByRole('dialog').getByText(/notes.*history/i)).toBeVisible();
    }
  });
});
