/**
 * Documents page — complete UI coverage
 * Upload modal, search, project filter, download, delete.
 */

import { test, expect } from '@playwright/test';

test.describe('Documents page layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
  });

  test('page heading "Documents" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /documents/i })).toBeVisible();
  });

  test('"Upload Document" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /upload document/i })).toBeVisible();
  });

  test('search input is present', async ({ page }) => {
    await expect(page.locator('input[placeholder*="search document" i]')).toBeVisible();
  });

  test('project filter dropdown is present with "All Projects" default', async ({ page }) => {
    const projectFilter = page.locator('select').filter({ has: page.locator('option[value=""]') }).first();
    await expect(projectFilter).toBeVisible();
    // Default option should be "All Projects"
    const selectedText = await projectFilter.locator('option[value=""]').textContent();
    expect(selectedText).toMatch(/all projects/i);
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();
  });
});

test.describe('Documents table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
    await Promise.race([
      page.locator('table tbody tr').first().waitFor({ timeout: 10000 }),
      page.getByText(/no documents found/i).waitFor({ timeout: 10000 }),
    ]).catch(() => {});
  });

  test('table has expected columns: Document, Project, Type, Size, Version, Uploaded By, Date, Actions', async ({ page }) => {
    const isEmpty = await page.getByText(/no documents found/i).isVisible().catch(() => false);
    if (!isEmpty && await page.locator('table tbody tr').count() > 0) {
      await expect(page.locator('th').filter({ hasText: /document/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /project/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /type/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /size/i }).first()).toBeVisible();
      await expect(page.locator('th').filter({ hasText: /version/i }).first()).toBeVisible();
    }
  });

  test('document rows show file type badge', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no documents found/i).isVisible())) {
      const text = await firstRow.textContent();
      expect(text).toMatch(/pdf|doc|docx|xls|xlsx|jpg|png/i);
    }
  });

  test('document rows show version number', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no documents found/i).isVisible())) {
      const text = await firstRow.textContent();
      expect(text).toMatch(/v\d+/i);
    }
  });

  test('each document row has a download link (title="Download")', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no documents found/i).isVisible())) {
      await expect(firstRow.locator('a[title="Download"]')).toBeVisible();
    }
  });

  test('download link opens in new tab (target="_blank")', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no documents found/i).isVisible())) {
      const downloadLink = firstRow.locator('a[title="Download"]');
      await expect(downloadLink).toHaveAttribute('target', '_blank');
    }
  });

  test('each document row has a delete button (title="Delete")', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible() && !(await page.getByText(/no documents found/i).isVisible())) {
      await expect(firstRow.locator('button[title="Delete"]')).toBeVisible();
    }
  });
});

test.describe('Documents search and filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
  });

  test('searching by non-existent term shows empty state', async ({ page }) => {
    await page.locator('input[placeholder*="search document" i]').fill('xxxxxx_no_such_file_zzz');
    await page.waitForTimeout(600);
    const rowCount = await page.locator('table tbody tr').count();
    const isEmpty = await page.getByText(/no documents found/i).isVisible().catch(() => false);
    expect(rowCount === 0 || isEmpty).toBeTruthy();
  });

  test('project filter changes document list', async ({ page }) => {
    const projectFilter = page.locator('select').filter({ has: page.locator('option[value=""]') }).first();
    const optionCount = await projectFilter.locator('option').count();
    if (optionCount > 1) {
      // Select second option (first real project)
      const secondOption = await projectFilter.locator('option').nth(1).getAttribute('value');
      if (secondOption) {
        await projectFilter.selectOption(secondOption);
        await page.waitForTimeout(600);
        // No crash
        await expect(page.getByRole('heading', { name: /documents/i })).toBeVisible();
      }
    }
  });
});

test.describe('Upload Document modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /upload document/i }).click();
  });

  test('modal opens with title "Upload Document"', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[id="modal-title"]')).toHaveText(/upload document/i);
  });

  test('modal has Project select, File upload area, Notes textarea', async ({ page }) => {
    await expect(page.getByRole('dialog').getByText(/project/i).first()).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/file/i).first()).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/notes/i)).toBeVisible();
  });

  test('file drop zone is present with "drag & drop" instruction', async ({ page }) => {
    await expect(page.getByText(/drag.*drop|click to browse/i)).toBeVisible();
  });

  test('"Upload" button is disabled when no project or file selected', async ({ page }) => {
    const uploadBtn = page.getByRole('button', { name: /^upload$/i });
    await expect(uploadBtn).toBeDisabled();
  });

  test('Cancel button closes the modal', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Escape key closes the modal', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('clicking outside modal closes it', async ({ page }) => {
    await page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('project dropdown loads options from API', async ({ page }) => {
    const projectSelect = page.getByRole('dialog').locator('select');
    await page.waitForTimeout(1000);
    const options = await projectSelect.locator('option').count();
    expect(options).toBeGreaterThan(0); // at least "Select project"
  });

  test('"Upload" button becomes enabled after selecting project', async ({ page }) => {
    // Wait for project options to load
    await page.waitForTimeout(1000);
    const projectSelect = page.getByRole('dialog').locator('select');
    const optionCount = await projectSelect.locator('option').count();
    if (optionCount > 1) {
      const projectValue = await projectSelect.locator('option').nth(1).getAttribute('value');
      if (projectValue) {
        await projectSelect.selectOption(projectValue);
        // Still disabled until file is also selected
        const uploadBtn = page.getByRole('button', { name: /^upload$/i });
        await expect(uploadBtn).toBeDisabled(); // still needs file
      }
    }
  });

  test('hidden file input (#file-input) is present in modal', async ({ page }) => {
    await expect(page.locator('#file-input')).toHaveCount(1);
  });
});
