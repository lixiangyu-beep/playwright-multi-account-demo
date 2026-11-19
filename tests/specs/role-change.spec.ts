import { test, expect } from '../fixtures';
import { ACME, uniqueEmail } from '../support/accounts';

test.describe('Cross-account: role changes take effect for the other user', () => {
  test('promotion to admin unlocks admin UI and API for the promoted user', async ({ as, loginAs, tempMember }) => {
    const target = await tempMember('member');
    const user = await loginAs(target.email, target.password);
    await user.dashboard.goto();
    await user.dashboard.expectRole('member');
    await expect(user.dashboard.inviteSection).toHaveCount(0);
    expect((await target.api.invite(ACME, uniqueEmail())).status(), 'member must not invite yet').toBe(403);

    const admin = await as('admin');
    await admin.dashboard.goto();
    await admin.dashboard.changeRole(target.email, 'admin');

    // Same session, no re-login: the new role must apply immediately
    await user.dashboard.reload();
    await user.dashboard.expectRole('admin');
    await expect(user.dashboard.inviteSection).toBeVisible();
    expect((await target.api.invite(ACME, uniqueEmail())).status(), 'promoted admin can invite').toBe(201);
  });

  test('demotion to viewer immediately removes write access', async ({ as, loginAs, tempMember }) => {
    const target = await tempMember('admin');
    const user = await loginAs(target.email, target.password);
    await user.dashboard.goto();
    await expect(user.dashboard.inviteSection).toBeVisible();

    const owner = await as('owner');
    await owner.dashboard.goto();
    await owner.dashboard.changeRole(target.email, 'viewer');

    await user.dashboard.reload();
    await user.dashboard.expectRole('viewer');
    await expect(user.dashboard.inviteSection).toHaveCount(0);
    const res = await target.api.invite(ACME, uniqueEmail());
    expect(res.status(), 'a freshly demoted viewer must get 403 on invite').toBe(403);
  });

  test("an admin cannot change the owner's role", async ({ apiAs }) => {
    const admin = await apiAs('admin');
    const res = await admin.changeRole(ACME, 'usr_1001', 'viewer');
    expect(res.status()).toBe(403);
  });
});
