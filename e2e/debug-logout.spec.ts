import { expect, test } from './fixtures';
import { AuthPage } from './pages/auth.page';

test.describe('Debug Logout Process', () => {
  test('debug logout step by step', async ({ preserveDataFirebasePage }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    console.log('=== Step 1: Create and login user ===');
    await authPage.createAndLoginTestUser(undefined, undefined, true);

    // Verify we're logged in
    const isLoggedInBefore = await authPage.isLoggedIn();
    console.log('Is logged in before logout:', isLoggedInBefore);
    expect(isLoggedInBefore).toBeTruthy();

    console.log('=== Step 2: Check UI state before logout ===');
    const logoutButtonBefore = await preserveDataFirebasePage
      .locator('[data-testid="logout-button-desktop"]')
      .isVisible()
      .catch(() => false);
    const loginButtonBefore = await preserveDataFirebasePage
      .locator('button:has-text("Login")')
      .isVisible()
      .catch(() => false);
    const accountButtonBefore = await preserveDataFirebasePage
      .locator('[data-testid="nav-account-desktop"]')
      .isVisible()
      .catch(() => false);

    console.log('Before logout - Logout button visible:', logoutButtonBefore);
    console.log('Before logout - Login button visible:', loginButtonBefore);
    console.log('Before logout - Account button visible:', accountButtonBefore);

    console.log('=== Step 3: Click logout button ===');
    await authPage.logout();

    console.log('=== Step 4: Check UI state immediately after logout ===');
    const logoutButtonAfter = await preserveDataFirebasePage
      .locator('[data-testid="logout-button-desktop"]')
      .isVisible()
      .catch(() => false);
    const loginButtonAfter = await preserveDataFirebasePage
      .locator('button:has-text("Login")')
      .isVisible()
      .catch(() => false);
    const accountButtonAfter = await preserveDataFirebasePage
      .locator('[data-testid="nav-account-desktop"]')
      .isVisible()
      .catch(() => false);

    console.log('After logout - Logout button visible:', logoutButtonAfter);
    console.log('After logout - Login button visible:', loginButtonAfter);
    console.log('After logout - Account button visible:', accountButtonAfter);

    // Check current URL
    console.log('Current URL after logout:', preserveDataFirebasePage.url());

    // Wait a bit longer for UI to update
    console.log('=== Step 5: Wait for UI to settle and check again ===');
    await preserveDataFirebasePage.waitForTimeout(3000);

    const logoutButtonFinal = await preserveDataFirebasePage
      .locator('[data-testid="logout-button-desktop"]')
      .isVisible()
      .catch(() => false);
    const loginButtonFinal = await preserveDataFirebasePage
      .locator('button:has-text("Login")')
      .isVisible()
      .catch(() => false);
    const accountButtonFinal = await preserveDataFirebasePage
      .locator('[data-testid="nav-account-desktop"]')
      .isVisible()
      .catch(() => false);

    console.log('Final - Logout button visible:', logoutButtonFinal);
    console.log('Final - Login button visible:', loginButtonFinal);
    console.log('Final - Account button visible:', accountButtonFinal);

    // Check if we got redirected to login page
    const finalUrl = preserveDataFirebasePage.url();
    console.log('Final URL:', finalUrl);

    if (finalUrl.includes('/auth/login')) {
      console.log('SUCCESS: User was redirected to login page after logout');
    } else {
      console.log('INFO: User stayed on same page after logout');
    }

    // Test our isLoggedIn method
    const isLoggedInAfter = await authPage.isLoggedIn();
    console.log(
      'Is logged in after logout (via isLoggedIn method):',
      isLoggedInAfter
    );

    // Take screenshots for comparison
    await preserveDataFirebasePage.screenshot({
      path: 'test-results/debug-logout-final.png',
    });

    expect(true).toBeTruthy(); // Always pass, this is for debugging
  });
});
