import { TEST_CONFIG } from './constants';
import { expect, test } from './fixtures';
import { AuthPage } from './pages/auth.page';

test.describe('Debug Authentication Persistence', () => {
  test('debug authentication state persistence', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    console.log('=== Step 1: Create and login user ===');
    await authPage.createAndLoginTestUser(undefined, undefined, true);

    console.log('Current URL after login:', preserveDataFirebasePage.url());

    // Check authentication state immediately after login
    console.log('=== Step 2: Check auth state immediately after login ===');
    const isLoggedInAfterLogin = await authPage.isLoggedIn();
    console.log('Is logged in after login:', isLoggedInAfterLogin);

    if (!isLoggedInAfterLogin) {
      console.log('User not detected as logged in. Checking page state...');

      // Check for auth indicators in the page
      const loginButtonVisible = await authPage.loginButton
        .isVisible()
        .catch(() => false);
      const accountIconVisible = await preserveDataFirebasePage
        .locator('mat-icon:has-text("account_circle")')
        .isVisible()
        .catch(() => false);
      const logoutButtonVisible = await preserveDataFirebasePage
        .locator('button[mattooltip="Log out"]')
        .isVisible()
        .catch(() => false);

      console.log('Login button visible:', loginButtonVisible);
      console.log('Account icon visible:', accountIconVisible);
      console.log('Logout button visible:', logoutButtonVisible);

      // Check the page content
      const bodyText = await preserveDataFirebasePage
        .locator('body')
        .textContent();
      console.log(
        'Page contains "login":',
        bodyText?.toLowerCase().includes('login')
      );
      console.log(
        'Page contains "logout":',
        bodyText?.toLowerCase().includes('logout')
      );
    }

    // Try navigating to home page
    console.log('=== Step 3: Navigate to home page ===');
    await preserveDataFirebasePage.goto(`${TEST_CONFIG.baseUrl}/`);
    await preserveDataFirebasePage.waitForTimeout(2000); // Give time for auth state to settle

    console.log(
      'Current URL after home navigation:',
      preserveDataFirebasePage.url()
    );

    // Check authentication state after navigation
    const isLoggedInAfterNavigation = await authPage.isLoggedIn();
    console.log('Is logged in after navigation:', isLoggedInAfterNavigation);

    if (!isLoggedInAfterNavigation) {
      // Check what's on the home page
      const homeLoginButtonVisible = await authPage.loginButton
        .isVisible()
        .catch(() => false);
      const homeAccountIconVisible = await preserveDataFirebasePage
        .locator('mat-icon:has-text("account_circle")')
        .isVisible()
        .catch(() => false);
      const homeLogoutButtonVisible = await preserveDataFirebasePage
        .locator('button[mattooltip="Log out"]')
        .isVisible()
        .catch(() => false);

      console.log('Home - Login button visible:', homeLoginButtonVisible);
      console.log('Home - Account icon visible:', homeAccountIconVisible);
      console.log('Home - Logout button visible:', homeLogoutButtonVisible);
    }

    // Try navigating to a protected route
    console.log('=== Step 4: Try accessing protected route ===');
    await preserveDataFirebasePage.goto(`${TEST_CONFIG.baseUrl}/groups`);
    await preserveDataFirebasePage.waitForTimeout(2000);

    const finalUrl = preserveDataFirebasePage.url();
    console.log('Final URL after protected route:', finalUrl);

    if (finalUrl.includes('/auth/login')) {
      console.log(
        'User was redirected to login - authentication not persisted'
      );
    } else {
      console.log('User stayed on protected route - authentication persisted');
    }

    // Take screenshots for visual debugging
    await preserveDataFirebasePage.screenshot({
      path: 'test-results/debug-auth-persistence.png',
    });

    expect(true).toBeTruthy(); // Always pass, this is for debugging
  });
});
