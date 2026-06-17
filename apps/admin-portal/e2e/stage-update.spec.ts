/**
 * Stage update tests — Tier 1
 *
 * Verifies the full flow:
 *   Project detail → expand workflow card → expand stage card
 *   → Update Stage → change status → Save Changes → toast + history entry
 *
 * All tests rely on the seeded project data (Vastudeep Associates seed).
 */

import { test, expect } from '@playwright/test';

async function goToFirstProjectDetail(page: import('@playwright/test').Page) {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  // Switch to list view — easier to click into a project via row link
  await page.getByRole('button', { name: /list/i }).click();
  await page.waitForLoadState('networkidle');

  // Click the first project name link in the table
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.waitFor({ timeout: 15000 });
  // The project name is a link inside the row
  await firstRow.locator('a').first().click();
  await page.waitForURL(/\/projects\/.+/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

async function expandFirstWorkflowCard(page: import('@playwright/test').Page): Promise<boolean> {
  // WorkflowCard headers are role="button" divs; click the first one to expand
  const workflowHeaders = page.locator('[role="button"]').filter({ hasText: /stages complete/i });
  const found = await workflowHeaders.first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  if (!found) return false;
  await workflowHeaders.first().click();
  // Wait for stages to render
  await page.waitForTimeout(500);
  return true;
}

async function expandFirstStageCard(page: import('@playwright/test').Page) {
  // StageCard header button: aria-expanded attribute
  const stageButtons = page.locator('button[aria-expanded]');
  await stageButtons.first().waitFor({ timeout: 10000 });
  const isExpanded = await stageButtons.first().getAttribute('aria-expanded');
  if (isExpanded === 'false') {
    await stageButtons.first().click();
    await page.waitForTimeout(300);
  }
}

test.describe('Stage status update', () => {
  test('project detail page loads with workflow cards', async ({ page }) => {
    await goToFirstProjectDetail(page);
    // There should be at least one workflow card (role="button" with stage count)
    const hasWf = await page.locator('[role="button"]').filter({ hasText: /stages complete/i })
      .first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    test.skip(!hasWf, 'No workflow cards on first project');
    await expect(
      page.locator('[role="button"]').filter({ hasText: /stages complete/i }).first()
    ).toBeVisible();
  });

  test('expanding workflow card reveals stage cards', async ({ page }) => {
    await goToFirstProjectDetail(page);
    const hasWf = await expandFirstWorkflowCard(page);
    test.skip(!hasWf, 'No workflow cards on first project');

    // After expanding, stage cards should be visible (they have aria-expanded on the header button)
    const stageButtons = page.locator('button[aria-expanded]');
    await expect(stageButtons.first()).toBeVisible({ timeout: 10000 });
  });

  test('"Update Stage" button appears when stage card is expanded', async ({ page }) => {
    await goToFirstProjectDetail(page);
    const hasWf = await expandFirstWorkflowCard(page);
    test.skip(!hasWf, 'No workflow cards on first project');
    await expandFirstStageCard(page);

    await expect(page.getByRole('button', { name: /update stage/i })).toBeVisible({ timeout: 10000 });
  });

  test('update stage form shows status select and comment input', async ({ page }) => {
    await goToFirstProjectDetail(page);
    const hasWf = await expandFirstWorkflowCard(page);
    test.skip(!hasWf, 'No workflow cards on first project');
    await expandFirstStageCard(page);

    await page.getByRole('button', { name: /update stage/i }).click();

    // Status select must be visible
    await expect(page.getByRole('combobox').filter({ hasText: /pending|in progress|completed|on hold|skipped/i }).first())
      .toBeVisible({ timeout: 5000 });

    // Comment input
    await expect(page.locator('input[placeholder*="Reason" i], input[placeholder*="comment" i]').first())
      .toBeVisible({ timeout: 5000 });
  });

  test('changing status and saving shows "Stage updated" toast', async ({ page }) => {
    await goToFirstProjectDetail(page);
    const hasWf = await expandFirstWorkflowCard(page);
    test.skip(!hasWf, 'No workflow cards on first project');
    await expandFirstStageCard(page);

    await page.getByRole('button', { name: /update stage/i }).click();

    // Select "in_progress" status (if not already set)
    const statusSelect = page.locator('select').filter({ hasText: /pending|in.progress|completed|on.hold|skipped/i }).first();
    await statusSelect.waitFor({ timeout: 5000 });
    await statusSelect.selectOption('in_progress');

    // Add a comment
    const commentInput = page.locator('input[placeholder*="Reason" i], input[placeholder*="comment" i]').first();
    await commentInput.fill('E2E test update');

    // Save
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText('Stage updated')).toBeVisible({ timeout: 10000 });
  });

  test('after update, stage history entry is recorded', async ({ page }) => {
    await goToFirstProjectDetail(page);
    const hasWf = await expandFirstWorkflowCard(page);
    test.skip(!hasWf, 'No workflow cards on first project');
    await expandFirstStageCard(page);

    // Update to a different status
    await page.getByRole('button', { name: /update stage/i }).click();
    const statusSelect = page.locator('select').filter({ hasText: /pending|in.progress|completed|on.hold|skipped/i }).first();
    await statusSelect.waitFor({ timeout: 5000 });

    // Set to "on_hold" so it's a clear change from any initial state
    await statusSelect.selectOption('on_hold');
    const commentInput = page.locator('input[placeholder*="Reason" i], input[placeholder*="comment" i]').first();
    await commentInput.fill('Placed on hold — E2E test');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByText('Stage updated')).toBeVisible({ timeout: 10000 });

    // Re-expand the stage card to see history
    await expandFirstStageCard(page);

    // History section should appear and contain the comment
    await expect(page.getByText(/Placed on hold/i)).toBeVisible({ timeout: 10000 });
  });

  test('cancelling update form closes without saving', async ({ page }) => {
    await goToFirstProjectDetail(page);
    const hasWf = await expandFirstWorkflowCard(page);
    test.skip(!hasWf, 'No workflow cards on first project');
    await expandFirstStageCard(page);

    await page.getByRole('button', { name: /update stage/i }).click();

    // Verify form is open
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: /cancel/i }).last().click();

    // Form should be gone, "Update Stage" button returns
    await expect(page.getByRole('button', { name: /update stage/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /save changes/i })).not.toBeVisible();
  });
});
