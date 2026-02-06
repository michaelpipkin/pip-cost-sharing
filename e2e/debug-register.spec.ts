import { test } from '@playwright/test';
import { AuthPage } from './pages/auth.page';

test.describe('Debug Register Page', () => {
  test('inspect register page structure', async ({ page }) => {
    const authPage = new AuthPage(page);

    // Navigate to register page
    console.log('Navigating to /auth/register...');
    await page.goto('/auth/register');

    // Wait for navigation and log current URL
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log('Current URL after navigation:', currentUrl);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/debug-register-page.png', fullPage: true });

    // Check if we were redirected
    if (!currentUrl.includes('/auth/register')) {
      console.log('Page was redirected, possibly due to loggedInGuard');
    }

    // Log page title
    const title = await page.title();
    console.log('Page title:', title);

    // Log all visible text
    const bodyText = await page.locator('body').textContent();
    console.log('Page content preview:', bodyText?.substring(0, 200));

    // Check for email inputs specifically
    const emailInputs = await page.locator('input[type="email"]').count();
    console.log('Number of email inputs found:', emailInputs);

    // Check for password inputs
    const passwordInputs = await page.locator('input[type="password"]').count();
    console.log('Number of password inputs found:', passwordInputs);

    // Check for form elements
    const forms = await page.locator('form').count();
    console.log('Number of forms found:', forms);

    // Check for Angular Material form fields
    const matFormFields = await page.locator('mat-form-field').count();
    console.log('Number of mat-form-field elements:', matFormFields);

    // Look for any buttons
    const buttons = await page.locator('button').count();
    console.log('Number of buttons found:', buttons);

    // List all button texts
    const buttonTexts = await page.locator('button').allTextContents();
    console.log('Button texts:', buttonTexts);

    // Check for error messages or loading states
    const errorElements = await page
      .locator('.error, .alert, [role="alert"]')
      .count();
    console.log('Number of error/alert elements:', errorElements);
  });
});
