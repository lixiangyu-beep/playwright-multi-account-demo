import { test, expect } from '../fixtures';
import { accounts, PASSWORD, SEED_ROLES } from '../support/accounts';
import { LoginPage } from '../pages/LoginPage';

test.describe('Authentication & per-role sessions', () => {
  for (const role of SEED_ROLES) {
    test(`${role} session from storageState lands on their own org dashboard`, async ({ as }) => {
      const { page, dashboard } = await as(role);
      await dashboard.goto();
      await expect(page.getByTestId('signed-in-as')).toHaveText(accounts[role].email);
      await dashboard.expectRole(role === 'outsider' ? 'owner' : role);
      await expect(dashboard.orgName).toHaveText(role === 'outsider' ? 'Globex Inc' : 'Acme Corp');
    });
  }

  test('two accounts can be signed in side by side in isolated contexts', async ({ as }) => {
    const owner = await as('owner');
    const viewer = await as('viewer');
    await Promise.all([owner.dashboard.goto(), viewer.dashboard.goto()]);
    await expect(owner.dashboard.inviteSection).toBeVisible();
    await expect(viewer.dashboard.inviteSection).toHaveCount(0);
  });

  test('wrong password is rejected', async ({ anonymous }) => {
    const { page } = await anonymous();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(accounts.member.email, `${PASSWORD}-wrong`);
    await login.expectError('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });
});
