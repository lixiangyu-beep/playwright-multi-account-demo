import { test, expect } from '../fixtures';
import { ACME } from '../support/accounts';

test.describe('Cross-account: sponsorship', () => {
  test('owner sponsors a member, member gets perks; stopping it revokes them', async ({ as, loginAs, tempMember }) => {
    const target = await tempMember('member');
    const member = await loginAs(target.email, target.password);
    expect((await target.api.perks(ACME)).status(), 'no perks before sponsorship').toBe(403);

    const owner = await as('owner');
    await owner.dashboard.goto();
    await owner.dashboard.toggleSponsorship(target.email);
    await expect(owner.dashboard.memberRow(target.email).getByTestId('member-sponsored')).toBeVisible();

    await member.dashboard.goto();
    await expect(member.dashboard.sponsoredBadge).toBeVisible();
    expect((await target.api.perks(ACME)).status(), 'perks once sponsored').toBe(200);

    await owner.dashboard.toggleSponsorship(target.email);
    await expect(owner.dashboard.memberRow(target.email).getByTestId('member-sponsored')).toHaveCount(0);
    await member.dashboard.reload();
    await expect(member.dashboard.sponsoredBadge).toHaveCount(0);
    expect((await target.api.perks(ACME)).status(), 'perks revoked when sponsorship stops').toBe(403);
  });
});
