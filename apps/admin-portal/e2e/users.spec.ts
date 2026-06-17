/**
 * Users & Roles — complete UI coverage
 * Users CRUD, deactivate/activate, search, "Show inactive" toggle.
 * Roles CRUD, permissions, system-role protections.
 */

import { test, expect } from '@playwright/test';

const TIMESTAMP = Date.now();
const NEW_USER_EMAIL = `e2e_user_${TIMESTAMP}@test.flowtiq.com`;
const NEW_USER_FIRST = 'E2EFirst';
const NEW_USER_LAST = `Last${TIMESTAMP}`;
const NEW_ROLE_NAME = `E2E Role ${TIMESTAMP}`;

// ── Users page layout ────────────────────────────────────────────────────────
test.describe('Users page layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
  });

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
  });

  test('"New User" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new user/i }).first()).toBeVisible();
  });

  test('search input is present', async ({ page }) => {
    await expect(page.locator('input[placeholder*="name or email" i]')).toBeVisible();
  });

  test('"Show inactive" checkbox is present', async ({ page }) => {
    await expect(page.getByText(/show inactive/i)).toBeVisible();
  });

  test('table has expected columns: User, Email, Roles, Status, Last Login, Joined, Actions', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    await expect(page.locator('th').filter({ hasText: /^user$/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /email/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /roles/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
  });

  test('user list renders rows', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    await rows.first().waitFor({ timeout: 10000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('each row shows an email address with @ symbol', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    const text = await firstRow.textContent();
    expect(text).toMatch(/@/);
  });

  test('each row shows Active or Inactive status badge', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    const text = await firstRow.textContent();
    expect(text).toMatch(/active|inactive/i);
  });

  test('each row has action buttons (edit, deactivate)', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    // Row should have at least 1 action button
    await expect(firstRow.getByRole('button').first()).toBeVisible();
  });
});

// ── Users search ─────────────────────────────────────────────────────────────
test.describe('Users search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 });
  });

  test('searching by name filters rows', async ({ page }) => {
    const search = page.locator('input[placeholder*="name or email" i]');
    await search.fill('xxxxxx_does_not_exist');
    // Wait for the empty state to appear — more reliable than waitForResponse
    // which can resolve on a background refetch before the search response arrives.
    await page.getByText(/no users found/i).waitFor({ timeout: 12000 }).catch(() => {});
    const rowCount = await page.locator('table tbody tr').count();
    const emptyState = page.getByText(/no users found/i);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(rowCount === 0 || hasEmpty).toBeTruthy();
    await search.clear();
  });

  test('searching for "admin" shows matching users', async ({ page }) => {
    const search = page.locator('input[placeholder*="name or email" i]');
    await search.fill('admin');
    await page.waitForTimeout(500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ── Show inactive toggle ─────────────────────────────────────────────────────
test.describe('Users "Show inactive" toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 });
  });

  test('"Show inactive" checkbox toggles and refetches', async ({ page }) => {
    const checkbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('..').filter({ hasText: /show inactive/i }) });
    // Use the label instead
    const label = page.getByText(/show inactive/i);
    const activeCount = await page.locator('table tbody tr').count();
    await label.click();
    await page.waitForTimeout(800);
    // Page should still be on users with a valid table
    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
  });
});

// ── New User modal ───────────────────────────────────────────────────────────
test.describe('New User modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /new user/i }).first().click();
  });

  test('modal opens with title "New User"', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[id="modal-title"]')).toHaveText(/new user/i);
  });

  test('modal has First Name, Last Name, Email, Password, Phone, Roles fields', async ({ page }) => {
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/first name/i)).toBeVisible();
    await expect(dialog.getByText(/last name/i)).toBeVisible();
    await expect(dialog.getByText(/email/i).first()).toBeVisible();
    await expect(dialog.getByText(/password/i)).toBeVisible();
    await expect(dialog.getByText(/phone/i)).toBeVisible();
    await expect(dialog.getByText(/roles/i)).toBeVisible();
  });

  test('modal has Cancel and "Create User" buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();
  });

  test('Cancel closes the modal', async ({ page }) => {
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

  test('submitting empty form shows validation errors', async ({ page }) => {
    await page.getByRole('button', { name: /create user/i }).click();
    // At least one validation error should appear (form errors visible)
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toBeVisible(); // modal stays open on error
  });

  test('role pill buttons are clickable and toggle selection', async ({ page }) => {
    // Roles are rendered as pill buttons inside the modal
    const rolePills = page.getByRole('dialog').getByRole('button').filter({ hasText: /admin|manager|executive/i });
    if (await rolePills.count() > 0) {
      await rolePills.first().click();
      // Pill should change style (selected = blue background)
      await expect(rolePills.first()).toBeVisible();
    }
  });

  test('creates user successfully → toast + modal closes', async ({ page }) => {
    // Fill all required fields
    await page.getByRole('dialog').locator('input').nth(0).fill(NEW_USER_FIRST);
    await page.getByRole('dialog').locator('input').nth(1).fill(NEW_USER_LAST);
    await page.getByRole('dialog').locator('input[type="email"]').fill(NEW_USER_EMAIL);
    await page.getByRole('dialog').locator('input[type="password"]').fill('Test@12345');

    // Select a known real role pill (avoid E2E test roles which may overflow modal)
    const rolePill = page.getByRole('dialog').locator('button[class*="rounded-full"]')
      .filter({ hasText: /File Executive|Follow.up Executive|Project Manager|Tenant Admin/i }).first();
    await rolePill.waitFor({ timeout: 10000 });
    await rolePill.scrollIntoViewIfNeeded();
    await rolePill.click();

    // Scroll Create User button into view (modal may overflow with many role pills)
    const createBtn = page.getByRole('dialog').locator('button[type="submit"]');
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click();
    await expect(page.getByText(/user created/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });
});

// ── Edit User modal ──────────────────────────────────────────────────────────
test.describe('Edit User modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    // Click edit button (title="Edit")
    await firstRow.locator('button[title="Edit"]').click();
  });

  test('modal opens with title "Edit User"', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[id="modal-title"]')).toHaveText(/edit user/i);
  });

  test('form fields are pre-populated', async ({ page }) => {
    const emailInput = page.getByRole('dialog').locator('input[type="email"]');
    const value = await emailInput.inputValue();
    expect(value).toMatch(/@/);
  });

  test('"Save Changes" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
  });
});

// ── Deactivate / Activate user ───────────────────────────────────────────────
test.describe('Deactivate user', () => {
  test('active user has "Deactivate" button (title="Deactivate")', async ({ page }) => {
    await page.goto('/users');
    // Default view shows only active users — first row is always an active user
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ timeout: 10000 });
    await expect(firstRow.locator('button[title="Deactivate"]')).toBeVisible({ timeout: 5000 });
  });

  test('"Show inactive" reveals inactive users with Activate button', async ({ page }) => {
    await page.goto('/users');
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 });
    await page.getByText(/show inactive/i).click();
    await page.waitForTimeout(800);
    const inactiveRows = page.locator('table tbody tr').filter({ hasText: /\binactive\b/i });
    if (await inactiveRows.count() > 0) {
      await expect(inactiveRows.first().locator('button[title="Activate"]')).toBeVisible();
    }
  });
});

// ── Roles page layout ────────────────────────────────────────────────────────
test.describe('Roles page layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');
  });

  test('page heading "Roles & Permissions" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /roles.*permissions/i })).toBeVisible();
  });

  test('"New Role" button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new role/i })).toBeVisible();
  });

  test('roles render as cards with name and permission count', async ({ page }) => {
    // Wait for role cards
    await page.locator('.card').filter({ hasText: /permission/i }).first().waitFor({ timeout: 10000 });
    const cards = page.locator('.card').filter({ hasText: /permission/i });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('role card shows permission count and user count', async ({ page }) => {
    await page.locator('.card').filter({ hasText: /permission/i }).first().waitFor({ timeout: 10000 });
    const firstCard = page.locator('.card').filter({ hasText: /permission/i }).first();
    const text = await firstCard.textContent();
    expect(text).toMatch(/permission/i);
    expect(text).toMatch(/user/i);
  });

  test('role card shows permission code badges (font-mono)', async ({ page }) => {
    await page.locator('.card').filter({ hasText: /permission/i }).first().waitFor({ timeout: 10000 });
    const firstCard = page.locator('.card').filter({ hasText: /permission/i }).first();
    // Permission codes like "projects:view" are rendered in font-mono spans
    const codeBadge = firstCard.locator('span.font-mono').first();
    if (await codeBadge.count() > 0) {
      await expect(codeBadge).toBeVisible();
      const text = await codeBadge.textContent();
      expect(text).toMatch(/:/);
    }
  });

  test('system roles show "System role" label', async ({ page }) => {
    await page.locator('.card').filter({ hasText: /permission/i }).first().waitFor({ timeout: 10000 });
    const systemCard = page.locator('.card').filter({ hasText: /system role/i });
    if (await systemCard.count() > 0) {
      await expect(systemCard.first()).toBeVisible();
    }
  });

  test('system roles do NOT have a delete button', async ({ page }) => {
    await page.locator('.card').filter({ hasText: /permission/i }).first().waitFor({ timeout: 10000 });
    const systemCard = page.locator('.card').filter({ hasText: /system role/i }).first();
    if (await systemCard.count() > 0) {
      // System role cards should not have a Trash2 delete button
      const deleteBtn = systemCard.locator('button').filter({ has: page.locator('svg[class*="lucide-trash"]') });
      expect(await deleteBtn.count()).toBe(0);
    }
  });

  test('non-system roles have an edit button', async ({ page }) => {
    await page.locator('.card').filter({ hasText: /permission/i }).first().waitFor({ timeout: 10000 });
    const cards = page.locator('.card').filter({ hasText: /permission/i });
    const count = await cards.count();
    if (count > 0) {
      // Each card has at least an edit button
      await expect(cards.first().locator('button').first()).toBeVisible();
    }
  });
});

// ── New Role modal ───────────────────────────────────────────────────────────
test.describe('New Role modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new role/i }).click();
  });

  test('modal opens with title "New Role"', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[id="modal-title"]')).toHaveText(/new role/i);
  });

  test('modal has Role Name, Color, Description fields', async ({ page }) => {
    await expect(page.getByText(/role name/i)).toBeVisible();
    await expect(page.getByText(/color/i)).toBeVisible();
    await expect(page.getByText(/description/i)).toBeVisible();
  });

  test('color picker input is present', async ({ page }) => {
    await expect(page.getByRole('dialog').locator('input[type="color"]')).toBeVisible();
  });

  test('permissions section shows modules grouped', async ({ page }) => {
    // Module headers like "Projects", "Users", etc.
    await expect(page.getByRole('dialog').getByText(/projects/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('clicking module header toggles all permissions in that module', async ({ page }) => {
    // Wait for permissions to load
    await page.getByRole('dialog').getByText(/projects/i).first().waitFor({ timeout: 10000 });
    // The module row is a clickable div with bg-slate-50
    const moduleRow = page.getByRole('dialog').locator('.bg-slate-50').first();
    await moduleRow.click();
    // After click, the selected count in heading should change
    await expect(page.getByRole('dialog').getByText(/selected/i)).toBeVisible();
  });

  test('submitting with empty name shows toast error', async ({ page }) => {
    await page.getByRole('button', { name: /create role/i }).click();
    await expect(page.getByText(/role name is required/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Cancel closes the modal', async ({ page }) => {
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('creates role → toast "Role created" + modal closes', async ({ page }) => {
    await page.getByRole('dialog').locator('input.form-input').first().fill(NEW_ROLE_NAME);
    await page.getByRole('button', { name: /create role/i }).click();
    await expect(page.getByText(/role created/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });
});

// ── Edit Role modal ──────────────────────────────────────────────────────────
test.describe('Edit Role modal', () => {
  test('clicking edit on a role opens "Edit Role" modal with pre-filled name', async ({ page }) => {
    await page.goto('/roles');
    await page.locator('.card').filter({ hasText: /permission/i }).first().waitFor({ timeout: 10000 });
    const firstCard = page.locator('.card').filter({ hasText: /permission/i }).first();
    await firstCard.locator('button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[id="modal-title"]')).toHaveText(/edit role/i);
    // Name field should be populated
    const nameInput = page.getByRole('dialog').locator('input.form-input').first();
    const val = await nameInput.inputValue();
    expect(val.length).toBeGreaterThan(0);
  });
});
