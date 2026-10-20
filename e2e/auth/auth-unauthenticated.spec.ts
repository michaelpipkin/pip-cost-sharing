import { expect, test } from '../fixtures';
import { TEST_DATA } from '../constants';
import { AuthPage } from '../pages/auth.page';

test.describe('Authentication - Unauthenticated User Tests', { tag: '@auth' }, () => {
  test('should display login form', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();

    // Check that login form elements are visible
    await expect(authPage.emailInput).toBeVisible();
    await expect(authPage.passwordInput).toBeVisible();
    await expect(authPage.loginButton).toBeVisible();
  });

  test('should display register form', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoSignUp();

    // Check that register form is visible
    // Note: Register page uses component-prefixed testids and some elements lack testids
    await expect(page.getByTestId('register-form')).toBeVisible();
    await expect(page.getByTestId('register-email-input')).toBeVisible();
    await expect(page.getByTestId('register-password-input')).toBeVisible();
    await expect(page.locator('button:has-text("Register")')).toBeVisible();
  });

  test('should show validation errors for invalid email', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();

    await authPage.emailInput.fill(TEST_DATA.invalidEmail);
    await authPage.passwordInput.fill(TEST_DATA.password);
    await authPage.emailInput.blur();

    // The signal form's email validator reports through mat-error.
    await expect(page.getByTestId('email-error-0')).toHaveText(
      /Invalid email address/
    );
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should show error for non-existent user login', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();

    await authPage.emailInput.fill('nonexistent@example.com');
    await authPage.passwordInput.fill('password123');
    await authPage.loginButton.click();

    await expect(page.getByTestId('snackbar')).toContainText(
      'Could not sign you in'
    );
    await expect(page).toHaveURL(/\/auth\/login/);
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
