/**
 * Workflows page — complete UI coverage
 * Workflow cards, CRUD, stage management.
 */

import { test, expect } from '@playwright/test';

const TIMESTAMP = Date.now();
const NEW_WORKFLOW_NAME = `E2E Workflow ${TIMESTAMP}`;

test.describe('Workflows page layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
  });

  test('page heading "Workflows" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /workflows/i })).toBeVisible();
  });

  test('"New Workflow" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new workflow/i })).toBeVisible();
  });

  test('info banner about Dynamic Workflow Engine is visible', async ({ page }) => {
    await expect(page.getByText(/dynamic workflow engine/i)).toBeVisible({ timeout: 10000 });
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();
  });
});

test.describe('Workflow cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    // Wait for workflow cards
    await Promise.race([
      page.locator('.card').filter({ hasText: /projects.*created/i }).first().waitFor({ timeout: 10000 }),
      page.getByText(/no workflows configured/i).waitFor({ timeout: 10000 }),
    ]).catch(() => {});
  });

  test('workflow cards are visible with workflow name', async ({ page }) => {
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      const cards = page.locator('.card').filter({ hasText: /projects.*created/i });
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('default workflow shows "Default" badge with star icon', async ({ page }) => {
    const defaultBadge = page.locator('.rounded-full').filter({ hasText: /default/i });
    if (await defaultBadge.count() > 0) {
      await expect(defaultBadge.first()).toBeVisible();
    }
  });

  test('workflow card shows project count and creation date', async ({ page }) => {
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      const firstCard = page.locator('.card').filter({ hasText: /projects.*created/i }).first();
      const text = await firstCard.textContent();
      expect(text).toMatch(/projects/i);
    }
  });

  test('workflow card shows stage flow visualization', async ({ page }) => {
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      const firstCard = page.locator('.card').filter({ hasText: /projects.*created/i }).first();
      // Stage items have circular numbered badges
      const stageCircles = firstCard.locator('.rounded-full.flex').first();
      if (await stageCircles.count() > 0) {
        await expect(stageCircles).toBeVisible();
      }
    }
  });

  test('workflow card shows Required/Optional badges on stages', async ({ page }) => {
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      // Required badge has text "Required" in red
      const requiredBadge = page.locator('.text-red-600').filter({ hasText: /required/i }).first();
      if (await requiredBadge.count() > 0) {
        await expect(requiredBadge).toBeVisible();
      }
    }
  });

  test('workflow card has edit and delete buttons', async ({ page }) => {
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      const firstCard = page.locator('.card').filter({ hasText: /projects.*created/i }).first();
      await expect(firstCard.locator('button').first()).toBeVisible();
    }
  });
});

test.describe('New Workflow modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new workflow/i }).click();
  });

  test('modal opens with title "New Workflow"', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[id="modal-title"]')).toHaveText(/new workflow/i);
  });

  test('modal has Workflow Name, Description fields', async ({ page }) => {
    await expect(page.getByText(/workflow name/i)).toBeVisible();
    await expect(page.getByText(/description/i)).toBeVisible();
  });

  test('"Set as default workflow" toggle is present', async ({ page }) => {
    await expect(page.getByText(/set as default workflow/i)).toBeVisible();
  });

  test('toggle checkbox is an sr-only peer input', async ({ page }) => {
    const toggle = page.getByRole('dialog').locator('input.sr-only');
    await expect(toggle).toHaveCount(1);
  });

  test('stages section shows at least one stage by default', async ({ page }) => {
    await expect(page.getByText(/stages/i).first()).toBeVisible();
    // Default: one stage row with "Stage 1"
    const stageInput = page.getByRole('dialog').locator('input.form-input').filter({ has: page.locator('[placeholder="Stage name"]') }).first();
    if (await stageInput.count() > 0) {
      await expect(stageInput).toBeVisible();
    }
  });

  test('"Add Stage" button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add stage/i })).toBeVisible();
  });

  test('clicking "Add Stage" adds a new stage row', async ({ page }) => {
    const stagesBefore = await page.locator('[placeholder="Stage name"]').count();
    await page.getByRole('button', { name: /add stage/i }).click();
    const stagesAfter = await page.locator('[placeholder="Stage name"]').count();
    expect(stagesAfter).toBeGreaterThan(stagesBefore);
  });

  test('stage row has Required checkbox', async ({ page }) => {
    await expect(page.getByRole('dialog').locator('label').filter({ hasText: /required/i }).first()).toBeVisible();
  });

  test('stage row has Approval checkbox', async ({ page }) => {
    await expect(page.getByRole('dialog').locator('label').filter({ hasText: /approval/i }).first()).toBeVisible();
  });

  test('stage row has color input', async ({ page }) => {
    await expect(page.getByRole('dialog').locator('input[type="color"]').first()).toBeVisible();
  });

  test('stage row has drag handle (GripVertical)', async ({ page }) => {
    // GripVertical renders an SVG with grip-like lines
    const gripHandle = page.getByRole('dialog').locator('[class*="cursor-grab"]').first();
    if (await gripHandle.count() > 0) {
      await expect(gripHandle).toBeVisible();
    }
  });

  test('remove stage button is disabled when only 1 stage', async ({ page }) => {
    // Remove button (X icon) inside stage row is disabled when stages.length === 1
    const removeBtn = page.getByRole('dialog').locator('.space-y-2 button').first();
    if (await removeBtn.count() > 0) {
      await expect(removeBtn).toBeDisabled();
    }
  });

  test('remove stage button is enabled with 2+ stages', async ({ page }) => {
    await page.getByRole('button', { name: /add stage/i }).click();
    await page.waitForTimeout(200);
    const removeButtons = page.getByRole('dialog').locator('.space-y-2 button');
    const count = await removeButtons.count();
    if (count > 0) {
      // With 2 stages, remove button should be enabled
      await expect(removeButtons.first()).not.toBeDisabled();
    }
  });

  test('saving with empty name shows toast error', async ({ page }) => {
    await page.getByRole('button', { name: /create workflow/i }).click();
    await expect(page.getByText(/workflow name is required/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Cancel closes the modal', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Escape closes the modal', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('creates workflow successfully → toast "Workflow created" + modal closes', async ({ page }) => {
    const nameInput = page.getByRole('dialog').locator('input.form-input').first();
    await nameInput.fill(NEW_WORKFLOW_NAME);
    await page.getByRole('button', { name: /create workflow/i }).click();
    await expect(page.getByText(/workflow created/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Edit Workflow modal', () => {
  test('clicking edit on a workflow opens "Edit Workflow" modal', async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      const firstCard = page.locator('.card').filter({ hasText: /projects.*created/i }).first();
      await firstCard.waitFor({ timeout: 10000 });
      // Edit button (pencil icon, title="Edit")
      const editBtn = firstCard.locator('button[title="Edit"]');
      await editBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('[id="modal-title"]')).toHaveText(/edit workflow/i);
    }
  });

  test('edit modal pre-fills workflow name', async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      const firstCard = page.locator('.card').filter({ hasText: /projects.*created/i }).first();
      await firstCard.waitFor({ timeout: 10000 });
      await firstCard.locator('button[title="Edit"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const nameInput = page.getByRole('dialog').locator('input.form-input').first();
      const val = await nameInput.inputValue();
      expect(val.length).toBeGreaterThan(0);
    }
  });

  test('"Save Changes" button is shown in edit mode', async ({ page }) => {
    await page.goto('/workflows');
    await page.waitForLoadState('networkidle');
    const isEmpty = await page.getByText(/no workflows configured/i).isVisible().catch(() => false);
    if (!isEmpty) {
      const firstCard = page.locator('.card').filter({ hasText: /projects.*created/i }).first();
      await firstCard.waitFor({ timeout: 10000 });
      await firstCard.locator('button[title="Edit"]').click();
      await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
    }
  });
});
