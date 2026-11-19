import { test, expect } from '../fixtures';
import { ACME } from '../support/accounts';
import { describeResponse } from '../support/api-client';
import { knownDefect } from '../support/defects';
import { ErrorPage } from '../pages/ErrorPage';

test.describe('Cross-account: removing a member revokes access', () => {
  test('removed member loses the dashboard and member list', async ({ as, loginAs, tempMember }) => {
    const target = await tempMember('member');
    const user = await loginAs(target.email, target.password);
    await user.dashboard.goto();
    await user.dashboard.expectRole('member');

    const owner = await as('owner');
    await owner.dashboard.goto();
    await owner.dashboard.removeMember(target.email);

    await user.dashboard.reload();
    await expect(user.dashboard.noOrgMessage).toBeVisible();
    const res = await target.api.members(ACME);
    expect(res.status(), await describeResponse(res)).toBe(403);
  });

  test(
    'removed member can no longer read confidential org data (existing session)',
    knownDefect('BUG-002'),
    async ({ as, loginAs, tempMember }, testInfo) => {
      const target = await tempMember('member');
      const user = await loginAs(target.email, target.password);
      // Sanity: while a member, the data is readable
      expect((await target.api.orgData(ACME)).status()).toBe(200);

      const owner = await as('owner');
      await owner.dashboard.goto();
      await owner.dashboard.removeMember(target.email);

      // API: the removed member's still-valid token
      const res = await target.api.orgData(ACME);
      await testInfo.attach('evidence: GET org data after removal', {
        body: await describeResponse(res),
        contentType: 'text/plain',
      });

      // UI: the removed member's still-open browser session
      await user.page.goto(`/orgs/${ACME}/data`);

      expect
        .soft(res.status(), `BUG-002: removed member's token must get 403 on /api/orgs/${ACME}/data`)
        .toBe(403);
      await new ErrorPage(user.page).expectAccessDenied(
        'BUG-002: removed member must not see the confidential data page'
      );
    }
  );
});
