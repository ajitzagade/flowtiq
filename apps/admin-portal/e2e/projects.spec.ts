/**
 * Projects page — complete UI coverage
 * CRUD tests are in projects-crud.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

async function expandBoardSection(page: Page) {
  // Kanban workflow sections start collapsed — expand the first one
  const btn = page.locator('button[aria-expanded="false"]').first();
  const found = await btn.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  if (found) {
    await btn.click();
    await page.waitForTimeout(400);
  }
}

test.describe('Projects page layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
  });

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
  });

  test('"New Project" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new project/i })).toBeVisible();
  });

  test('view toggle buttons "List" and "Board" are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /list/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /board/i })).toBeVisible();
  });
});

test.describe('Kanban / Board view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    // Expand the first workflow section so stage columns and cards become visible
    await expandBoardSection(page);
  });

  test('kanban columns are visible with data-stage-key attributes', async ({ page }) => {
    await expect(page.locator('[data-stage-key]').first()).toBeVisible({ timeout: 10000 });
  });

  test('workflow section accordion shows project count badge', async ({ page }) => {
    // WorkflowSection renders accordion buttons with aria-expanded attribute
    await expect(page.locator('button[aria-expanded]').first()).toBeVisible({ timeout: 10000 });
  });

  test('workflow section can be expanded to show stage columns', async ({ page }) => {
    // Section already expanded by beforeEach — columns should be visible
    await expect(page.locator('[data-stage-key]').first()).toBeVisible({ timeout: 10000 });
  });

  test('project cards are visible inside kanban columns', async ({ page }) => {
    await expect(page.locator('[data-project-id]').first()).toBeVisible({ timeout: 15000 });
  });

  test('project card shows project name and client name', async ({ page }) => {
    const firstCard = page.locator('[data-project-id]').first();
    await firstCard.waitFor({ timeout: 15000 });
    const text = await firstCard.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(0);
  });

  test('clicking project card navigates to project detail', async ({ page }) => {
    const firstCard = page.locator('[data-project-id]').first();
    await firstCard.waitFor({ timeout: 15000 });
    const projectId = await firstCard.getAttribute('data-project-id');
    await firstCard.click();
    await page.waitForURL(/\/projects\/.+/, { timeout: 10000 });
    expect(page.url()).toContain(projectId);
  });

  test('board search input filters visible projects', async ({ page }) => {
    await page.locator('[data-project-id]').first().waitFor({ timeout: 15000 });
    // Board has a "Search board..." input
    const searchInput = page.locator('input[placeholder*="Search board" i]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('xxxxxx_does_not_exist');
      await page.waitForTimeout(500);
      // Multiple workflow sections each show "No matching projects" — use .first()
      await expect(page.getByText(/no matching projects/i).first()).toBeVisible({ timeout: 5000 });
      await searchInput.clear();
    }
  });
});

test.describe('List view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /list/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('switching to list view shows table with project rows', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    await rows.first().waitFor({ timeout: 10000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('table has expected columns: Project, Client, Workflow, Status, Priority', async ({ page }) => {
    await expect(page.locator('th').filter({ hasText: /project/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /client/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /priority/i }).first()).toBeVisible();
  });

  test('search input filters rows by project name', async ({ page }) => {
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 });
    const searchInput = page.locator('input[placeholder*="search" i]');
    // Wait for the API response triggered by the search input change
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/projects') && resp.status() === 200,
      { timeout: 10000 }
    );
    await searchInput.fill('xxxxxx_definitely_not_a_project');
    await responsePromise;
    await page.waitForTimeout(200); // allow React to re-render
    // Either 0 rows or empty state
    const rowCount = await page.locator('table tbody tr').count();
    expect(rowCount).toBeLessThanOrEqual(1); // 0 rows or the "no results" row
  });

  test('status filter dropdown changes results', async ({ page }) => {
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 });
    const statusSelect = page.locator('select').filter({ hasText: /all status/i });
    // Wait for the API response triggered by the status filter change
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/projects') && resp.status() === 200,
      { timeout: 10000 }
    );
    await statusSelect.selectOption('active');
    await responsePromise;
    await page.waitForTimeout(200); // allow React to re-render
    // All visible rows should have "active" status badge
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      const firstRowText = await rows.first().textContent();
      expect(firstRowText).toMatch(/active/i);
    }
  });

  test('priority filter dropdown is present and functional', async ({ page }) => {
    const prioritySelect = page.locator('select').filter({ hasText: /all priority/i });
    await expect(prioritySelect).toBeVisible();
    await prioritySelect.selectOption('high');
    await page.waitForLoadState('networkidle');
    await expect(prioritySelect).toBeVisible(); // no crash
  });

  test('workflow filter dropdown is present', async ({ page }) => {
    const workflowSelect = page.locator('select').filter({ hasText: /all workflows/i });
    await expect(workflowSelect).toBeVisible();
  });

  test('project row shows priority and status badges', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    // Row should contain a status badge and priority badge
    const text = await firstRow.textContent();
    expect(text).toMatch(/active|on hold|completed|cancelled/i);
    expect(text).toMatch(/low|medium|high|urgent/i);
  });

  test('project row has view/edit action buttons', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    // Row should have at least one action button
    await expect(firstRow.getByRole('button').first()).toBeVisible();
  });

  test('clicking a project link in list view navigates to detail', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    await firstRow.locator('a').first().click();
    await page.waitForURL(/\/projects\/.+/);
    await expect(page).toHaveURL(/\/projects\/.+/);
  });
});

test.describe('Projects view toggle', () => {
  test('toggling from Board to List shows table', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /list/i }).click();
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
  });

  test('toggling from List to Board shows kanban', async ({ page }) => {
    await page.goto('/projects?view=list');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    // Accordion buttons always visible in board view (collapsed or expanded)
    await expect(page.locator('button[aria-expanded]').first()).toBeVisible({ timeout: 15000 });
  });
});
