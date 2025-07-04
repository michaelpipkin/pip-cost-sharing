import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';
import { TEST_DATA } from '../constants';
import { createTestUser } from '../utils/firebase';

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
    // Use the actual selectors from your Angular Material forms
    this.emailInput = this.page.locator('input[type="email"]');
    // Use more specific selectors for password fields to avoid conflicts
    this.passwordInput = this.page.locator('input[formControlName="password"]');
    this.confirmPasswordInput = this.page.locator(
      'input[formControlName="confirmPassword"]'
    );
    this.loginButton = this.page.locator('button:has-text("Login")');
    this.signUpButton = this.page.locator(
      'button:has-text("Sign Up"), button:has-text("Register")'
    );
    this.forgotPasswordLink = this.page.locator(
      'a:has-text("Forgot"), a:has-text("forgot")'
    );
    this.errorMessage = this.page.locator(
      '.error, .alert-danger, [role="alert"]'
    );
    this.successMessage = this.page.locator('.success, .alert-success');
  }

  /**
   * Navigate to login page
   */
  async gotoLogin() {
    await super.goto('/auth/login');
    await this.waitForLoad();
  }

  /**
   * Navigate to sign up page
   */
  async gotoSignUp() {
    await super.goto('/auth/register');
    // Don't wait for networkidle on register page due to hCaptcha
    // Instead, wait for domcontentloaded and then for form elements
    await this.page.waitForLoadState('domcontentloaded');
    await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.waitForLoad();
  }

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string, confirmPassword?: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    if (confirmPassword && this.confirmPasswordInput) {
      await this.confirmPasswordInput.fill(confirmPassword);
    }
    await this.signUpButton.click();
    // Don't wait for networkidle after signup due to potential hCaptcha interaction
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Create a test user in Firebase Auth emulator and login
   */
  async createAndLoginTestUser(
    email: string = TEST_DATA.testUsers.regularUser.email,
    password: string = TEST_DATA.testUsers.regularUser.password,
    useUniqueUser: boolean = true
  ) {
    let finalEmail = email;
    let finalPassword = password;

    // Generate unique user if requested to avoid conflicts
    if (useUniqueUser) {
      const uniqueUser = TEST_DATA.generateUniqueUser();
      finalEmail = uniqueUser.email;
      finalPassword = uniqueUser.password;
    }

    try {
      // Try to create user in Firebase Auth emulator
      await createTestUser(this.page, finalEmail, finalPassword);
    } catch (error) {
      // If user already exists, that's fine - we'll just try to login
      console.log(
        `User ${finalEmail} may already exist, attempting login anyway`
      );
    }

    // Navigate to login page and login
    await this.gotoLogin();
    await this.login(finalEmail, finalPassword);
  }

  /**
   * Logout (if logout functionality exists)
   */
  async logout() {
    // Wait for any loading spinners to disappear first
    await this.page
      .locator('.spinner-container, .loading')
      .waitFor({
        state: 'hidden',
        timeout: 10000,
      })
      .catch(() => {
        // If no spinner found, that's fine - continue
        console.log('No loading spinner found, proceeding with logout');
      });

    // Look for the logout button in the nav bar
    const logoutButton = this.page.locator(
      'button[mattooltip="Log out"], button:has-text("logout"), a:has-text("Log out")'
    );

    try {
      await logoutButton.waitFor({ state: 'visible', timeout: 5000 });

      // Use force click to bypass any overlay issues
      await logoutButton.click({ force: true });

      // Don't wait for network idle after logout as it might redirect
      await this.page.waitForTimeout(2000);
    } catch (error) {
      throw new Error(`Could not find logout button: ${error.message}`);
    }
  }

  /**
   * Check if user is logged in by looking for elements that are guaranteed to be visible
   * to any logged-in user (account, logout, groups) based on the UserStore.isLoggedIn signal
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      // Wait longer in CI environments for UI to settle after potential state changes
      const waitTime = process.env.CI ? 3000 : 1500;
      await this.page.waitForTimeout(waitTime);

      // Check for the three elements guaranteed to be visible to any logged-in user:
      // 1. Logout button - always visible when logged in
      const logoutButton = this.page.locator(
        'button[mattooltip="Log out"], button[aria-label="log out"]'
      );
      // 2. Account button - always visible when logged in
      const accountButton = this.page.locator(
        'a[mattooltip="Account"], a[aria-label="account"]'
      );
      // 3. Groups link - always visible when logged in (even for users with no groups)
      const groupsLink = this.page.locator(
        'a[routerlink="groups"], a[href="/groups"]'
      );

      // Wait for at least one authenticated element to appear (with longer timeout in CI)
      const authTimeout = process.env.CI ? 10000 : 5000;
      try {
        await Promise.race([
          logoutButton.waitFor({ state: 'visible', timeout: authTimeout }),
          accountButton.waitFor({ state: 'visible', timeout: authTimeout }),
          groupsLink.waitFor({ state: 'visible', timeout: authTimeout }),
        ]);
      } catch {
        // If none appear within timeout, continue with normal checks
      }

      // Check for elements that appear when isLoggedIn() is false
      const loginButton = this.page.locator(
        'a[routerlink="auth/login"], a[href="/auth/login"], button:has-text("Log in")'
      );

      // If login elements are visible, user is not logged in
      const loginVisible = await loginButton.isVisible().catch(() => false);
      if (loginVisible) {
        return false;
      }

      // Check if any of the three guaranteed logged-in elements are visible
      const logoutVisible = await logoutButton.isVisible().catch(() => false);
      const accountVisible = await accountButton.isVisible().catch(() => false);
      const groupsVisible = await groupsLink.isVisible().catch(() => false);

      // User is logged in if any of these three elements are visible
      return logoutVisible || accountVisible || groupsVisible;
    } catch (error) {
      console.log('Error checking login status:', error);
      // If we can't determine state, assume logged out
      return false;
    }
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string) {
    await this.forgotPasswordLink.click();
    await this.emailInput.fill(email);
    const resetButton = this.getByTestId('reset-password-button');
    await resetButton.click();
    await this.waitForLoad();
  }
}
