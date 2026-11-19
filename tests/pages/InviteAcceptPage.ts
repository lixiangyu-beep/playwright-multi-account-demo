import { expect, Locator, Page } from '@playwright/test';

export class InviteAcceptPage {
  readonly invitedRole: Locator;
  readonly alreadyUsed: Locator;

  constructor(readonly page: Page) {
    this.invitedRole = page.getByTestId('invite-role');
    this.alreadyUsed = page.getByTestId('invite-used');
  }

  async goto(inviteUrl: string) {
    await this.page.goto(inviteUrl);
  }

  async signUpAndJoin(name: string, password: string) {
    await this.page.getByLabel('Your name').fill(name);
    await this.page.getByLabel('Choose a password').fill(password);
    await this.page.getByRole('button', { name: 'Create account & join' }).click();
    await expect(this.page).toHaveURL(/\/dashboard$/);
  }
}
