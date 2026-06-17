/**
 * Projects CRUD — Tier 1
 *
 * Tests creating a project end-to-end:
 *   New Project button → fill form → submit → verify appears in list
 *
 * Editing: open edit modal from list → change name → save → verify updated name
 *
 * Uses a timestamp-based name so each run creates unique records and
 * doesn't interfere with existing seed data.
 */

import { test, expect } from '@playwright/test';

// Unique name per run to avoid collisions
const timestamp = Date.now();
const NEW_PROJECT_NAME = `E2E Test Project ${timestamp}`;
const CLIENT_NAME = `E2E Client ${timestamp}`;
const UPDATED_PROJECT_NAME = `E2E Updated Project ${timestamp}`;

test.describe('Create project', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
  });

  test('"New Project" button opens modal', async ({ page }) => {
    await page.getByRole('button', { name: /new project/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/new project/i)).toBeVisible();
  });

  test('submitting empty form shows required field errors', async ({ page }) => {
    await page.getByRole('button', { name: /new project/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /create project/i }).click();
    // At least one validation error should appear
    await expect(page.getByText(/required/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('creates a project and shows success toast', async ({ page }) => {
    await page.getByRole('button', { name: /new project/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Fill required fields
    await modal.getByLabel(/project name/i).fill(NEW_PROJECT_NAME);
    await modal.getByLabel(/client name/i).fill(CLIENT_NAME);

    // Select a project owner — wait for users to load
    const ownerSelect = modal.getByLabel(/project owner/i);
    await ownerSelect.waitFor({ timeout: 10000 });
    // Choose first real option (not the placeholder "Select owner")
    const options = await ownerSelect.locator('option').all();
    const firstRealOption = options.find(async (o) => {
      const val = await o.getAttribute('value');
      return val && val.length > 0;
    });
    if (firstRealOption) {
      const val = await firstRealOption.getAttribute('value');
      await ownerSelect.selectOption(val!);
    }

    await page.getByRole('button', { name: /create project/i }).click();

    // Toast confirms success
    await expect(page.getByText('Project created')).toBeVisible({ timeout: 10000 });

    // Modal closes
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('created project appears in list view', async ({ page }) => {
    // Switch to list view
    await page.getByRole('button', { name: /list/i }).click();
    await page.waitForLoadState('networkidle');

    // Open create modal
    await page.getByRole('button', { name: /new project/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    const runName = `E2E List View ${Date.now()}`;
    await modal.getByLabel(/project name/i).fill(runName);
    await modal.getByLabel(/client name/i).fill('List View Client');

    const ownerSelect = modal.getByLabel(/project owner/i);
    await ownerSelect.waitFor({ timeout: 10000 });
    const options = ownerSelect.locator('option:not([value=""])');
    await options.first().waitFor({ state: 'attached', timeout: 10000 });
    const firstVal = await options.first().getAttribute('value');
    if (firstVal) await ownerSelect.selectOption(firstVal);

    await page.getByRole('button', { name: /create project/i }).click();
    await expect(page.getByText('Project created')).toBeVisible({ timeout: 10000 });

    // Newly created project should appear in the table
    await expect(page.getByRole('cell', { name: runName })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Edit project', () => {
  test('edit modal opens with existing project data pre-filled', async ({ page }) => {
    await page.goto('/projects');
    // Switch to list view to access the edit button
    await page.getByRole('button', { name: /list/i }).click();
    await page.waitForLoadState('networkidle');

    // Find the first project's edit button (Edit icon button per row)
    const editButtons = page.getByRole('button', { name: /edit/i });
    await editButtons.first().waitFor({ timeout: 10000 });
    await editButtons.first().click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/edit project/i)).toBeVisible();

    // Project name field should already be filled
    const nameInput = modal.getByLabel(/project name/i);
    const currentValue = await nameInput.inputValue();
    expect(currentValue.length).toBeGreaterThan(0);
  });

  test('updating project name reflects in the list', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /list/i }).click();
    await page.waitForLoadState('networkidle');

    // First create a project so we have something we own to edit
    await page.getByRole('button', { name: /new project/i }).click();
    const createModal = page.getByRole('dialog');
    const editableName = `E2E Edit Source ${Date.now()}`;
    await createModal.getByLabel(/project name/i).fill(editableName);
    await createModal.getByLabel(/client name/i).fill('Edit Client');
    const ownerSelect = createModal.getByLabel(/project owner/i);
    await ownerSelect.waitFor({ timeout: 10000 });
    const firstOpt = ownerSelect.locator('option:not([value=""])').first();
    await firstOpt.waitFor({ timeout: 10000 });
    await ownerSelect.selectOption(await firstOpt.getAttribute('value') ?? '');
    await page.getByRole('button', { name: /create project/i }).click();
    await expect(page.getByText('Project created')).toBeVisible({ timeout: 10000 });

    // Locate the row with our project and click its edit button
    const row = page.getByRole('row', { name: new RegExp(editableName, 'i') });
    await row.waitFor({ timeout: 10000 });
    await row.getByRole('button', { name: /edit/i }).click();

    const editModal = page.getByRole('dialog');
    await expect(editModal).toBeVisible();
    const nameInput = editModal.getByLabel(/project name/i);
    await nameInput.clear();
    await nameInput.fill(UPDATED_PROJECT_NAME);
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText('Project updated')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: UPDATED_PROJECT_NAME })).toBeVisible({ timeout: 10000 });
  });
});
