import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * The email action screen (/auth/account-action?mode=...&oobCode=...) as the
 * verify-email link opens it: a card with a title, then a processing, success
 * or error state, and the buttons for each.
 */
export class AccountActionPage extends BasePage {
  readonly card: Locator;
  readonly title: Locator;
  readonly success: Locator;
  readonly successMessage: Locator;
  readonly successHint: Locator;
  readonly error: Locator;
  readonly errorMessage: Locator;
  readonly continueToLogin: Locator;
  readonly continueToAccount: Locator;
  readonly backToLogin: Locator;
  readonly backToAccount: Locator;
  readonly resendButton: Locator;

  constructor(page: Page) {
    super(page);
    this.card = page.getByTestId('account-action-card');
    this.title = page.getByTestId('account-action-title');
    this.success = page.getByTestId('account-action-success');
    this.successMessage = page.getByTestId('account-action-success-message');
    this.successHint = page.getByTestId('account-action-success-hint');
    this.error = page.getByTestId('account-action-error');
    this.errorMessage = page.getByTestId('account-action-error-message');
    this.continueToLogin = page.getByTestId('account-action-continue-login');
    this.continueToAccount = page.getByTestId(
      'account-action-continue-account'
    );
    this.backToLogin = page.getByTestId('account-action-back-login');
    this.backToAccount = page.getByTestId('account-action-back-account');
    this.resendButton = page.getByTestId('account-action-resend-button');
  }

  /** Opens an action link path (full load) and waits for the card. */
  async open(path: string): Promise<void> {
    await this.page.goto(path);
    await expect(this.card).toBeVisible();
  }
}
