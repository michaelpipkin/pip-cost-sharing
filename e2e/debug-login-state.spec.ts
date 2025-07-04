import { expect, test } from './fixtures';
import { AuthPage } from './pages/auth.page';

test.describe('Debug Login State Detection', () => {
  test('debug what elements are visible after login', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    console.log('=== Creating and logging in user ===');
    await authPage.createAndLoginTestUser(undefined, undefined, true);

    console.log('Current URL after login:', preserveDataFirebasePage.url());
    console.log(
      'Page title after login:',
      await preserveDataFirebasePage.title()
    );

    // Wait a bit for the app to settle
    await preserveDataFirebasePage.waitForTimeout(3000);

    console.log('=== Checking UI elements ===');

    // Check for login-related elements
    const loginButton = preserveDataFirebasePage.locator(
      'button:has-text("Login"), a:has-text("Login")'
    );
    const loginVisible = await loginButton.isVisible().catch(() => false);
    console.log('Login button visible:', loginVisible);

    // Check for logout-related elements
    const logoutButton = preserveDataFirebasePage.locator(
      'button[mattooltip="Log out"], button:has-text("logout"), a:has-text("Log out")'
    );
    const logoutVisible = await logoutButton.isVisible().catch(() => false);
    console.log('Logout button visible:', logoutVisible);

    // Check for account-related elements
    const accountButton = preserveDataFirebasePage.locator(
      'a[mattooltip="Account"], a[aria-label="account"]'
    );
    const accountVisible = await accountButton.isVisible().catch(() => false);
    console.log('Account button visible:', accountVisible);

    // Check for account circle icon
    const accountIcon = preserveDataFirebasePage.locator(
      'mat-icon:has-text("account_circle")'
    );
    const accountIconVisible = await accountIcon.isVisible().catch(() => false);
    console.log('Account circle icon visible:', accountIconVisible);

    // Look for any buttons or links with "account" text
    const anyAccountElement = preserveDataFirebasePage.locator(
      '*:has-text("account"), *:has-text("Account")'
    );
    const anyAccountCount = await anyAccountElement.count();
    console.log('Elements containing "account":', anyAccountCount);

    // Look for any logout-related elements
    const anyLogoutElement = preserveDataFirebasePage.locator(
      '*:has-text("logout"), *:has-text("Logout"), *:has-text("Log out")'
    );
    const anyLogoutCount = await anyLogoutElement.count();
    console.log('Elements containing "logout":', anyLogoutCount);

    // Check the page content for logged-in indicators
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
    console.log(
      'Page contains "account":',
      bodyText?.toLowerCase().includes('account')
    );
    console.log(
      'Page contains "welcome":',
      bodyText?.toLowerCase().includes('welcome')
    );

    // Check what navigation elements are present
    const navElements = await preserveDataFirebasePage
      .locator('nav button, nav a')
      .count();
    console.log('Navigation elements count:', navElements);

    if (navElements > 0) {
      console.log('=== Navigation elements ===');
      const navButtons = await preserveDataFirebasePage
        .locator('nav button, nav a')
        .all();
      for (let i = 0; i < Math.min(navButtons.length, 10); i++) {
        const text = await navButtons[i].textContent();
        const ariaLabel = await navButtons[i].getAttribute('aria-label');
        const tooltip = await navButtons[i].getAttribute('mattooltip');
        console.log(
          `Nav element ${i}: text="${text}", aria-label="${ariaLabel}", tooltip="${tooltip}"`
        );
      }
    }

    // Take a screenshot for visual inspection
    await preserveDataFirebasePage.screenshot({
      path: 'test-results/debug-login-state.png',
    });

    // Test our isLoggedIn method
    const isLoggedInResult = await authPage.isLoggedIn();
    console.log('AuthPage.isLoggedIn() result:', isLoggedInResult);

    expect(true).toBeTruthy(); // Always pass, this is for debugging
  });
});
