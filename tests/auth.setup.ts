import { test as setup, expect } from '@playwright/test';
import { accounts, authFile, PASSWORD, SEED_ROLES } from './support/accounts';
import { LoginPage } from './pages/LoginPage';

/**
 * Logs every seeded account in through the real login UI once and saves its
 * storageState (session cookie) to .auth/<role>.json. Tests then open one browser
 * context per account without paying the login cost again.
 */
for (const role of SEED_ROLES) {
  setup(`authenticate as ${role} (${accounts[role].email})`, async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(accounts[role].email, PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('signed-in-as')).toHaveText(accounts[role].email);
    await page.context().storageState({ path: authFile(role) });
  });
}
