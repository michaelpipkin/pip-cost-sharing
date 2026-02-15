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
   * Navigate to login page
   */
  async gotoLogin() {
    await super.goto('/auth/login');
    await this.waitForLoad();
    // Wait for the login form to be visible
    await this.page.waitForSelector('[data-testid="login-form"]', {
      state: 'visible',
      timeout: 5000,
    });
    // Give Angular time to initialize
    await this.page.waitForTimeout(500);
  }

  /**
   * Navigate to sign up page
   */
  async gotoSignUp() {
    await super.goto('/auth/register');
    // Don't wait for networkidle on register page due to hCaptcha
    // Instead, wait for domcontentloaded
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for register form email input (has different testid than login page)
    await this.page
      .getByTestId('register-email-input')
      .waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string) {
    // Wait for the form to be fully loaded
    await this.page.waitForSelector('[data-testid="login-form"]', {
      state: 'visible',
      timeout: 5000,
    });

    // Fill the form fields
    await this.emailInput.fill(email);
    await this.page.waitForTimeout(300);
    await this.passwordInput.fill(password);
    await this.page.waitForTimeout(300);

    // Wait for the button to be enabled (form validation)
    await this.loginButton.waitFor({ state: 'visible', timeout: 5000 });

    // Check if the button is enabled before clicking
    const isDisabled = await this.loginButton.isDisabled();
    if (isDisabled) {
      throw new Error('Login button is disabled - form may be invalid');
    }

    // Click the button
    await this.loginButton.click();

    // Wait for successful login (navigation to groups page or removal of login form)
    await Promise.race([
      this.page.waitForURL('**/groups', { timeout: 10000 }),
      this.page.waitForSelector('[data-testid="logout-button-desktop"]', {
        state: 'visible',
        timeout: 10000,
      }),
    ]).catch(() => {
      console.log('Login may have failed - no navigation detected');
    });

    // Give time for auth state to settle
    await this.page.waitForTimeout(1000);
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
   * Login or create a test user with specific credentials.
   * This method tries to login first, and only creates the user if login fails.
   * Useful for test specs that want to reuse the same user across multiple tests.
   *
   * @param email - Email address for the user
   * @param password - Password for the user
   */
  async loginOrCreateTestUser(email: string, password: string) {
    // Navigate to login page
    await this.gotoLogin();
    await this.waitForLoadingComplete();

    // Try to login first (user may already exist from previous test)
    await this.login(email, password);
    await this.waitForLoadingComplete();

    // Check if login was successful
    const loggedIn = await this.isLoggedIn();

    if (loggedIn) {
      // Login succeeded - user already exists
      return;
    }

    // Login failed, user doesn't exist yet - create and try again
    try {
      // Create the user in Firebase Auth emulator
      await createTestUser(this.page, email, password);

      // Navigate back to login page and try again
      await this.gotoLogin();
      await this.waitForLoadingComplete();
      await this.login(email, password);
      await this.waitForLoadingComplete();

      // Verify login succeeded this time
      const finalLoginStatus = await this.isLoggedIn();
      if (!finalLoginStatus) {
        throw new Error(
          `Created user ${email} but login still failed - check Firebase Auth emulator`
        );
      }
    } catch (createError) {
      throw new Error(
        `Failed to create and login user ${email}: ${createError.message}`
      );
    }
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
      await logoutButton.waitFor({ state: 'visible', timeout: 5000 });

      // Use force click to bypass any overlay issues
      await logoutButton.click({ force: true });

      // Wait for logout operation to complete
      await this.waitForLoadingComplete();
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
      await this.waitForLoadingComplete();

      // Check for elements that appear when logged out first (faster)
      const loginButton = this.page.locator(
        '[data-testid="nav-login-desktop"]'
      );

      // If login button is visible, user is not logged in
      const loginVisible = await loginButton.isVisible().catch(() => false);
      if (loginVisible) {
        return false;
      }

      // Check for logged-in elements
      const logoutButton = this.page.locator(
        '[data-testid="logout-button-desktop"]'
      );
      const accountButton = this.page.locator(
        '[data-testid="nav-account-desktop"]'
      );

      // Check if any of the two guaranteed logged-in elements are visible
      const logoutVisible = await logoutButton.isVisible().catch(() => false);
      const accountVisible = await accountButton.isVisible().catch(() => false);

      // User is logged in if any of these two elements are visible
      return logoutVisible || accountVisible;
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
    await this.waitForLoadingComplete();
  }
}
