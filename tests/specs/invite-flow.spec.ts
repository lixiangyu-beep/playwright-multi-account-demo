import { test, expect } from '../fixtures';
import { PASSWORD, uniqueEmail } from '../support/accounts';
import { InviteAcceptPage } from '../pages/InviteAcceptPage';

test.describe('Cross-account: invite → accept', () => {
  test('admin invites, invitee accepts in another context, admin sees the new member', async ({ as, anonymous }) => {
    const admin = await as('admin');
    const email = uniqueEmail();

    // Account 1 (admin) sends the invite
    await admin.dashboard.goto();
    const inviteUrl = await admin.dashboard.invite(email, 'member');
    await expect(admin.dashboard.inviteItem(email).getByTestId('invite-status')).toHaveText('pending');

    // Account 2 (invitee, separate browser context) accepts it
    const invitee = await anonymous();
    const acceptPage = new InviteAcceptPage(invitee.page);
    await acceptPage.goto(inviteUrl);
    await expect(acceptPage.invitedRole).toHaveText('member');
    await acceptPage.signUpAndJoin('New Hire', PASSWORD);
    await invitee.dashboard.expectRole('member');
    await expect(invitee.dashboard.orgName).toHaveText('Acme Corp');

    // Back in account 1: the change is visible after a reload
    await admin.dashboard.reload();
    await expect(admin.dashboard.memberRow(email).getByTestId('member-role')).toHaveText('member');
    await expect(admin.dashboard.inviteItem(email).getByTestId('invite-status')).toHaveText('accepted');
  });

  test('an accepted invite link cannot be reused by someone else', async ({ as, anonymous }) => {
    const owner = await as('owner');
    const email = uniqueEmail();
    await owner.dashboard.goto();
    const inviteUrl = await owner.dashboard.invite(email, 'viewer');

    const first = await anonymous();
    const firstAccept = new InviteAcceptPage(first.page);
    await firstAccept.goto(inviteUrl);
    await firstAccept.signUpAndJoin('First Person', PASSWORD);

    const second = await anonymous();
    const secondAccept = new InviteAcceptPage(second.page);
    await secondAccept.goto(inviteUrl);
    await expect(secondAccept.alreadyUsed).toBeVisible();
  });

  test('the invited role is enforced: a viewer invitee gets read-only UI', async ({ as, anonymous }) => {
    const admin = await as('admin');
    const email = uniqueEmail();
    await admin.dashboard.goto();
    const inviteUrl = await admin.dashboard.invite(email, 'viewer');

    const invitee = await anonymous();
    await new InviteAcceptPage(invitee.page).goto(inviteUrl);
    await new InviteAcceptPage(invitee.page).signUpAndJoin('Read Only', PASSWORD);
    await invitee.dashboard.expectRole('viewer');
    await expect(invitee.dashboard.inviteSection).toHaveCount(0);
  });
});
