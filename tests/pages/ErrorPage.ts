import { expect, Page } from '@playwright/test';

export class ErrorPage {
  constructor(readonly page: Page) {}

  async expectAccessDenied(message = 'Access should be denied') {
    await expect(this.page.getByTestId('error-status'), message).toHaveText('403');
  }
}
