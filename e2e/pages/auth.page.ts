import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

// The post-login navigation lazy-loads the landing route's chunks and waits
// on Firestore listeners, so it gets more than the default expect timeout.
const LANDING_TIMEOUT_MS = 30_000;

export class AuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly loginButton: Locator;
  readonly signUpButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);
    // Use data-testid selectors for reliable element selection
    this.emailInput = this.page.getByTestId('email-input');
    this.passwordInput = this.page.getByTestId('password-input');
    this.confirmPasswordInput = this.page.locator(
      'input[formControlName="confirmPassword"]'
    );
    this.loginButton = this.page.getByTestId('login-submit-button');
    this.signUpButton = this.page.locator(
      'button:has-text("Sign Up"), button:has-text("Register")'
    );
    this.forgotPasswordLink = this.page.getByTestId('forgot-password-link');
    this.errorMessage = this.page.locator(
      '.error, .alert-danger, [role="alert"]'
    );
    this.successMessage = this.page.locator('.success, .alert-success');
  }

  /**
   * Navigate to the login page. Waits only for DOMContentLoaded (the form
   * assertions that follow do the real waiting), with the config's default
   * timeouts: global setup warms the dev server, so a slow load is a real
   * regression.
   */
  async gotoLogin() {
    await super.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByTestId('login-form')).toBeVisible();
    // Fields are bound by Angular once the form renders; make sure they are
    // there before a caller starts typing.
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
  }

  /**
   * Navigate to sign up page
   */
  async gotoSignUp() {
    await super.goto('/auth/register');
    // Don't wait for networkidle - background analytics requests never
    // fully quiesce. Wait for domcontentloaded instead.
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for register form email input (has different testid than login page)
    await expect(this.page.getByTestId('register-email-input')).toBeVisible();
  }

  /**
   * Fills and submits the login form (already on screen), then waits until
   * the app has landed: the authenticated shell (desktop logout button) is
   * showing, the post-login redirect has left /auth/login, and the loading
   * overlay is gone. Shared by login() and signInAs().
   *
   * A rejected sign-in surfaces the login snackbar, which fails this
   * immediately with `context` and the snackbar's message. Any snackbar from
   * an earlier action is waited out first so it can't be mistaken for a
   * rejection of this submit.
   */
  async submitLogin(
    email: string,
    password: string,
    context: string = `login(${email})`
  ): Promise<void> {
    const { snackbar } = this;

    await expect(this.emailInput).toBeVisible();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await expect(this.emailInput).toHaveValue(email);
    await expect(this.passwordInput).toHaveValue(password);
    await expect(this.loginButton).toBeEnabled();
    // A leftover snackbar auto-dismisses after 4 s (SNACKBAR_DURATION).
    await expect(
      snackbar,
      `${context}: a snackbar from an earlier action never went away`
    ).toHaveCount(0);
    await this.loginButton.click();

    const authenticated = this.page
      .getByTestId('logout-button-desktop')
      .filter({ visible: true });
    await expect(
      authenticated.or(snackbar).first(),
      `${context}: neither the authenticated shell nor a login error appeared`
    ).toBeVisible({ timeout: LANDING_TIMEOUT_MS });
    // No snackbar existed before the submit, so any now is this attempt's.
    if ((await snackbar.count()) > 0) {
      const message = (await snackbar.first().innerText()).split('\n')[0];
      throw new Error(`${context}: sign-in rejected - "${message}"`);
    }

    await expect(
      this.page,
      `${context}: never redirected away from login`
    ).not.toHaveURL(/\/auth\/login/, { timeout: LANDING_TIMEOUT_MS });
    await expect(
      this.page.getByTestId('loading-spinner-container'),
      `${context}: loading overlay never cleared`
    ).toBeHidden({ timeout: LANDING_TIMEOUT_MS });
  }

  /**
   * Login with email and password (on the login page). Throws if the
   * sign-in is rejected.
   */
  async login(email: string, password: string) {
    await this.submitLogin(email, password);
  }

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string, confirmPassword?: string) {
    await this.emailInput.fill(email);
    await this.emailInput.blur();
    await expect(this.emailInput).toHaveValue(email);

    await this.passwordInput.fill(password);
    await this.passwordInput.blur();
    await expect(this.passwordInput).toHaveValue(password);

    if (confirmPassword && this.confirmPasswordInput) {
      await this.confirmPasswordInput.fill(confirmPassword);
      await this.confirmPasswordInput.blur();
      await expect(this.confirmPasswordInput).toHaveValue(confirmPassword);
    }

    await this.signUpButton.click();
    // Don't wait for networkidle after signup - see gotoSignUp() above.
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Logout (if logout functionality exists)
   */
  async logout() {
    // Look for the logout button in the nav bar using data-testid
    const logoutButton = this.page.locator(
      '[data-testid="logout-button-desktop"]'
    );

    try {
      await logoutButton.waitFor({ state: 'visible' });

      // Use force click to bypass any overlay issues
      await logoutButton.click({ force: true });

      // Wait for logout operation to complete
      await this.waitForLoadingComplete();
    } catch (error) {
      throw new Error(`Could not find logout button: ${error.message}`);
    }
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string) {
    await this.forgotPasswordLink.click();
    await this.emailInput.fill(email);
    await this.emailInput.blur();
    await expect(this.emailInput).toHaveValue(email);
    const resetButton = this.getByTestId('reset-password-button');
    await resetButton.click();
    await this.waitForLoadingComplete();
  }
}
