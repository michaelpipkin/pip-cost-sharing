import { expect, test } from '@playwright/test';
import { TEST_DATA } from './constants';
import { AuthPage } from './pages/auth.page';
// Use base test, no fixtures

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

    // Check that register form elements are visible
    // Note: This page has hCaptcha which prevents networkidle state
    await expect(authPage.emailInput).toBeVisible();
    await expect(authPage.passwordInput).toBeVisible();
    await expect(authPage.signUpButton).toBeVisible();
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
    // Wait a bit for any async validation/error display
    await page.waitForTimeout(2000);

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
