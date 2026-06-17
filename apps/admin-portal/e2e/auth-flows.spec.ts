/**
 * Auth flow tests — Tier 1
 *
 * "unauthenticated" describe: overrides storageState to start logged out.
 * "authenticated" describe: uses the default storageState (already logged in).
 *
 * Note: The login page has no client-side redirect for already-authenticated users.
 * Auth guard lives in DashboardLayout — only protected routes redirect to /login.
 */

import { test, expect } from '@playwright/test';

// ── Unauthenticated tests ────────────────────────────────────────────────────
test.describe('Login — unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page is accessible and shows form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('demo credentials box is visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/demo credentials/i)).toBeVisible();
    await expect(page.getByText(/admin@vastudeep\.com/i)).toBeVisible();
  });

  test('shows email validation error for invalid format', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('not-an-email');
    await page.locator('input[type="password"]').fill('anypassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error toast for wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@vastudeep.com');
    await page.locator('input[type="password"]').fill('WrongPassword999');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error toast for non-existent user', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('nobody@doesnotexist.com');
    await page.locator('input[type="password"]').fill('Admin@123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('password visibility toggle shows/hides password text', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('mypassword');
    // Click the eye icon toggle button
    await page.locator('button[type="button"]').filter({ has: page.locator('svg') }).last().click();
    // Input type should now be "text"
    await expect(page.locator('input[type="text"][placeholder*="password" i]')).toBeVisible({ timeout: 3000 });
    // Click again to hide
    await page.locator('button[type="button"]').filter({ has: page.locator('svg') }).last().click();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('successful login redirects to dashboard with welcome toast', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@vastudeep.com');
    await page.locator('input[type="password"]').fill('Admin@123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByText(/welcome back/i)).toBeVisible({ timeout: 5000 });
  });

  test('accessing protected route while unauthenticated redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('accessing /projects while unauthenticated redirects to login', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});

// ── Authenticated tests ──────────────────────────────────────────────────────
test.describe('Session — authenticated', () => {
  test('logout button clears session and redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('navigation', { name: /main navigation/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('after logout, accessing /dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /sign out/i }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('after logout, accessing /projects redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /sign out/i }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('user name is shown in sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('navigation', { name: /main navigation/i })).toBeVisible();
    // Sidebar shows user full name when expanded
    await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: 5000 });
  });
});
