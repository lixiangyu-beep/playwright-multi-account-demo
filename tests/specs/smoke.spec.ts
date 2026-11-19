import { test, expect } from '@playwright/test';

/**
 * Minimal smoke example: open the demo app and save a screenshot of what rendered.
 * The PNG lands in test-results/ (gitignored). It is produced by the run, not committed.
 */
test('smoke: open the login page and save a screenshot', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle(/Log in · TeamHub/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await page.screenshot({ path: 'test-results/smoke-login.png', fullPage: true });
});
