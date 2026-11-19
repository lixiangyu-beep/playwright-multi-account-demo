import { expect, Locator, Page } from '@playwright/test';
import type { OrgRole } from '../support/accounts';

export class DashboardPage {
  readonly currentRole: Locator;
  readonly orgName: Locator;
  readonly noOrgMessage: Locator;
  readonly inviteSection: Locator;
  readonly sponsoredBadge: Locator;

  constructor(readonly page: Page) {
    this.currentRole = page.getByTestId('current-role');
    this.orgName = page.getByTestId('org-name');
    this.noOrgMessage = page.getByTestId('no-org');
    this.inviteSection = page.getByTestId('invite-section');
    this.sponsoredBadge = page.getByTestId('sponsored-badge');
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  /** Other accounts change state server-side; a reload is how a real user would see it. */
  async reload() {
    await this.page.reload();
  }

  memberRow(email: string): Locator {
    return this.page.locator(`[data-testid="member-row"][data-email="${email}"]`);
  }

  inviteItem(email: string): Locator {
    return this.page.locator(`[data-testid="invite-item"][data-email="${email}"]`);
  }

  async expectRole(role: OrgRole) {
    await expect(this.currentRole, `current user should have role "${role}"`).toHaveText(role);
  }

  /** Sends an invite through the UI and returns the absolute invite link shown to the admin. */
  async invite(email: string, role: 'admin' | 'member' | 'viewer' = 'member'): Promise<string> {
    const form = this.inviteSection;
    await form.getByLabel('Email').fill(email);
    await form.getByLabel('Role').selectOption(role);
    await form.getByRole('button', { name: 'Send invite' }).click();
    const link = this.inviteItem(email).getByTestId('invite-link');
    await expect(link).toBeVisible();
    return new URL((await link.getAttribute('href'))!, this.page.url()).toString();
  }

  async changeRole(email: string, role: 'admin' | 'member' | 'viewer') {
    const row = this.memberRow(email);
    await row.getByRole('combobox', { name: `Role for ${email}` }).selectOption(role);
    await row.getByRole('button', { name: 'Save role' }).click();
    await expect(this.memberRow(email).getByTestId('member-role')).toHaveText(role);
  }

  async removeMember(email: string) {
    await this.memberRow(email).getByRole('button', { name: 'Remove' }).click();
    await expect(this.memberRow(email)).toHaveCount(0);
  }

  async toggleSponsorship(email: string) {
    const row = this.memberRow(email);
    await row.getByRole('button', { name: /^(Sponsor|Stop sponsoring)$/ }).click();
  }
}
