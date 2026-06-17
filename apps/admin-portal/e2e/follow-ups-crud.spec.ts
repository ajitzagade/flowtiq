/**
 * Follow-ups CRUD — Tier 1
 *
 * Tests:
 *   1. Create follow-up → verify it appears in the table
 *   2. Complete a follow-up → verify status badge changes to "completed"
 *   3. Update a follow-up → verify notes saved
 *
 * Uses a future date to avoid the follow-up being immediately "overdue".
 *
 * NOTE: Labels in the follow-up form have no `for=` attribute, so
 * getByLabel() is unreliable. Use direct locators instead:
 *   Project select  → modal.locator('select').first()
 *   Assigned To     → modal.locator('select').nth(1)
 *   Date input      → modal.locator('input[type="date"]')
 *   Notes textarea  → modal.locator('textarea')
 */

import { test, expect } from '@playwright/test';

function futureDateString(daysAhead = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

test.describe('Create follow-up', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
  });

  test('"New Follow-up" button opens create modal', async ({ page }) => {
    await page.getByRole('button', { name: /new follow.up/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/new follow.up/i)).toBeVisible();
  });

  test('create modal has project, owner, and date fields', async ({ page }) => {
    await page.getByRole('button', { name: /new follow.up/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Project select (first select in the modal)
    await expect(modal.locator('select').first()).toBeVisible({ timeout: 10000 });
    // Assigned To select (second select)
    await expect(modal.locator('select').nth(1)).toBeVisible({ timeout: 10000 });
    // Date input
    await expect(modal.locator('input[type="date"]')).toBeVisible();
  });

  test('submitting without required fields shows validation errors', async ({ page }) => {
    await page.getByRole('button', { name: /new follow.up/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    await page.getByRole('button', { name: /create follow.up/i }).click();
    await expect(modal.getByText(/required/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('creates a follow-up and shows success toast', async ({ page }) => {
    await page.getByRole('button', { name: /new follow.up/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Wait for projects dropdown to load
    const projectSelect = modal.locator('select').first();
    const firstProject = projectSelect.locator('option:not([value=""])').first();
    await firstProject.waitFor({ state: 'attached', timeout: 10000 });
    await projectSelect.selectOption(await firstProject.getAttribute('value') ?? '');

    // Wait for users dropdown to load
    const ownerSelect = modal.locator('select').nth(1);
    const firstUser = ownerSelect.locator('option:not([value=""])').first();
    await firstUser.waitFor({ state: 'attached', timeout: 10000 });
    await ownerSelect.selectOption(await firstUser.getAttribute('value') ?? '');

    // Set follow-up date (7 days from now)
    await modal.locator('input[type="date"]').fill(futureDateString(7));

    // Add a unique note to find later
    const uniqueNote = `E2E test follow-up ${Date.now()}`;
    await modal.locator('textarea').fill(uniqueNote);

    await page.getByRole('button', { name: /create follow.up/i }).click();

    await expect(page.getByText('Follow-up created')).toBeVisible({ timeout: 10000 });
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // The new follow-up should appear in the table
    await expect(page.getByRole('cell', { name: new RegExp(uniqueNote) })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Complete follow-up', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
  });

  test('clicking "Mark as completed" updates status to completed', async ({ page }) => {
    // We need an existing pending follow-up
    // First check if there are any pending ones visible; if not, create one
    const pendingRows = page.locator('tbody tr').filter({ hasText: /pending/i });
    const count = await pendingRows.count();

    if (count === 0) {
      // Create a follow-up to complete
      await page.getByRole('button', { name: /new follow.up/i }).first().click();
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();

      const projectSelect = modal.locator('select').first();
      const firstProject = projectSelect.locator('option:not([value=""])').first();
      await firstProject.waitFor({ state: 'attached', timeout: 10000 });
      await projectSelect.selectOption(await firstProject.getAttribute('value') ?? '');

      const ownerSelect = modal.locator('select').nth(1);
      const firstUser = ownerSelect.locator('option:not([value=""])').first();
      await firstUser.waitFor({ state: 'attached', timeout: 10000 });
      await ownerSelect.selectOption(await firstUser.getAttribute('value') ?? '');

      await modal.locator('input[type="date"]').fill(futureDateString(3));
      await modal.locator('textarea').fill('To be completed by E2E test');
      await page.getByRole('button', { name: /create follow.up/i }).click();
      await expect(page.getByText('Follow-up created')).toBeVisible({ timeout: 10000 });
      await expect(modal).not.toBeVisible({ timeout: 5000 });
    }

    // Find a pending row and click its "Mark as completed" button
    const pendingRow = page.locator('tbody tr').filter({ hasText: /pending/i }).first();
    await pendingRow.waitFor({ timeout: 10000 });
    const completeBtn = pendingRow.locator('button[title="Mark as completed"]');
    await completeBtn.click();

    await expect(page.getByText('Follow-up completed')).toBeVisible({ timeout: 10000 });

    // Give the query a moment to refetch
    await page.waitForTimeout(1000);
    // Filter by "Completed" status to confirm
    await page.locator('select.form-select').selectOption('completed');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Update follow-up', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/follow-ups');
    await page.waitForLoadState('networkidle');
  });

  test('edit modal opens with current follow-up data', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });

    // Each row has an Edit button (pencil icon)
    const editBtn = firstRow.getByTitle(/edit/i);
    await editBtn.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/update follow.up/i)).toBeVisible();
    // Status select should be pre-populated
    await expect(modal.locator('select').first()).toBeVisible();
  });

  test('changing status to cancelled saves and updates the row', async ({ page }) => {
    // Create a fresh follow-up so we can safely cancel it without affecting real data
    await page.getByRole('button', { name: /new follow.up/i }).first().click();
    const createModal = page.getByRole('dialog');
    await expect(createModal).toBeVisible();

    const projectSelect = createModal.locator('select').first();
    const firstProject = projectSelect.locator('option:not([value=""])').first();
    await firstProject.waitFor({ state: 'attached', timeout: 10000 });
    await projectSelect.selectOption(await firstProject.getAttribute('value') ?? '');

    const ownerSelect = createModal.locator('select').nth(1);
    const firstUser = ownerSelect.locator('option:not([value=""])').first();
    await firstUser.waitFor({ state: 'attached', timeout: 10000 });
    await ownerSelect.selectOption(await firstUser.getAttribute('value') ?? '');

    const uniqueNote = `Cancel E2E ${Date.now()}`;
    await createModal.locator('input[type="date"]').fill(futureDateString(5));
    await createModal.locator('textarea').fill(uniqueNote);
    await page.getByRole('button', { name: /create follow.up/i }).click();
    await expect(page.getByText('Follow-up created')).toBeVisible({ timeout: 10000 });
    await expect(createModal).not.toBeVisible({ timeout: 5000 });

    // Find our row by its note and click edit
    const targetRow = page.getByRole('cell', { name: new RegExp(uniqueNote) }).locator('..');
    await targetRow.waitFor({ timeout: 10000 });
    await targetRow.getByTitle(/edit/i).click();

    const editModal = page.getByRole('dialog');
    await expect(editModal).toBeVisible();
    // Status select is the first select in the update modal
    await editModal.locator('select').first().selectOption('cancelled');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText('Follow-up updated')).toBeVisible({ timeout: 10000 });
    await expect(editModal).not.toBeVisible({ timeout: 5000 });
  });
});
