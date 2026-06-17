/**
 * Auth setup — runs once before all test suites.
 * Logs in and saves browser storage state to .auth/user.json.
 * All other test files load this state, so no test needs to log in manually.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.join(__dirname, '../.auth/user.json');
// Ensure the directory exists before Playwright writes the file
fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');

  await page.locator('input[type="email"]').fill('admin@vastudeep.com');
  await page.locator('input[type="password"]').fill('Admin@123');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

  // Persist auth cookies + localStorage so all tests skip login
  await page.context().storageState({ path: AUTH_FILE });
});
