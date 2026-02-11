import { expect, test } from '../fixtures';
import { TEST_DATA } from '../constants';
import { AuthPage } from '../pages/auth.page';

test.describe('Authentication - Unauthenticated User Tests', () => {
  test('should display login form', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();

    // Check that login form elements are visible
    await expect(authPage.emailInput).toBeVisible();
    await expect(authPage.passwordInput).toBeVisible();
    await expect(authPage.loginButton).toBeVisible();
  });

  test('should display register form (with hCaptcha)', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoSignUp();

    // Check that register form is visible
    // Note: Register page uses component-prefixed testids and some elements lack testids
    await expect(page.getByTestId('register-form')).toBeVisible();
    await expect(page.getByTestId('register-email-input')).toBeVisible();
    // Password field and submit button don't have testids, use formControlName/text selectors
    await expect(page.locator('input[formControlName="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Register")')).toBeVisible();
  });

  test('should show validation errors for invalid email', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();

    // Try to login with invalid email
    await authPage.emailInput.fill(TEST_DATA.invalidEmail);
    await authPage.passwordInput.fill(TEST_DATA.password);
    await authPage.loginButton.click();

    // Should show some kind of validation error
    // We'll check for either a form validation error or Firebase error
    const hasFormError = await authPage.emailInput.evaluate(
      (el: HTMLInputElement) => {
        return !el.validity.valid;
      }
    );

    const hasErrorMessage = await authPage.errorMessage
      .isVisible()
      .catch(() => false);

    expect(hasFormError || hasErrorMessage).toBeTruthy();
  });

  test('should show error for non-existent user login', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();

    // Try to login with valid format but non-existent user
    await authPage.emailInput.fill('nonexistent@example.com');
    await authPage.passwordInput.fill('password123');
    await authPage.loginButton.click();

    // Should show some kind of error message
    // Wait for async Firebase auth validation (standard timeout for backend operations)
    await page.waitForTimeout(1500);

    const hasErrorMessage = await authPage.errorMessage
      .isVisible()
      .catch(() => false);

    // If no explicit error message, check if we're still on login page
    // (successful login would redirect away)
    const stillOnLoginPage = page.url().includes('/auth/login');

    expect(hasErrorMessage || stillOnLoginPage).toBeTruthy();
  });

  test('should navigate between login and register forms', async ({ page }) => {
    const authPage = new AuthPage(page);

    // Start on login page
    await authPage.gotoLogin();
    await expect(authPage.loginButton).toBeVisible();

    // Navigate to register (assuming there's a link or button)
    // We'll navigate directly for now, but you might want to test the UI navigation
    await authPage.gotoSignUp();
    await expect(authPage.signUpButton).toBeVisible();

    // Navigate back to login
    await authPage.gotoLogin();
    await expect(authPage.loginButton).toBeVisible();
  });
});
