import { TEST_CONFIG } from './constants';
import { expect, test } from './fixtures';
import { AuthPage } from './pages/auth.page';

test.describe('Debug Firebase Fixture', () => {
  test('compare page vs firebasePage behavior', async ({
    page,
    firebasePage,
  }) => {
    console.log('=== Testing with regular page ===');

    // Test with regular page
    const authPage1 = new AuthPage(page);
    await authPage1.gotoLogin();

    console.log('Regular page URL:', page.url());
    console.log('Regular page title:', await page.title());

    // Check if elements exist
    const emailExists1 = await authPage1.emailInput
      .isVisible()
      .catch(() => false);
    const passwordExists1 = await authPage1.passwordInput
      .isVisible()
      .catch(() => false);
    const loginExists1 = await authPage1.loginButton
      .isVisible()
      .catch(() => false);

    console.log('Regular page - Email input visible:', emailExists1);
    console.log('Regular page - Password input visible:', passwordExists1);
    console.log('Regular page - Login button visible:', loginExists1);

    // Get page content for comparison
    const bodyContent1 = await page.locator('body').textContent();
    console.log(
      'Regular page body contains "Login":',
      bodyContent1?.includes('Login')
    );

    console.log('\n=== Testing with firebasePage ===');

    // Test with firebasePage
    const authPage2 = new AuthPage(firebasePage);
    await authPage2.gotoLogin();

    console.log('Firebase page URL:', firebasePage.url());
    console.log('Firebase page title:', await firebasePage.title());

    // Check if elements exist
    const emailExists2 = await authPage2.emailInput
      .isVisible()
      .catch(() => false);
    const passwordExists2 = await authPage2.passwordInput
      .isVisible()
      .catch(() => false);
    const loginExists2 = await authPage2.loginButton
      .isVisible()
      .catch(() => false);

    console.log('Firebase page - Email input visible:', emailExists2);
    console.log('Firebase page - Password input visible:', passwordExists2);
    console.log('Firebase page - Login button visible:', loginExists2);

    // Get page content for comparison
    const bodyContent2 = await firebasePage.locator('body').textContent();
    console.log(
      'Firebase page body contains "Login":',
      bodyContent2?.includes('Login')
    );

    // Check if Firebase emulator config exists in window
    const hasEmulatorConfig = await firebasePage.evaluate(() => {
      return !!(window as any).__FIREBASE_EMULATOR_CONFIG__;
    });
    console.log('Firebase page has emulator config:', hasEmulatorConfig);

    // Take screenshots for visual comparison
    await page.screenshot({ path: 'test-results/debug-regular-page.png' });
    await firebasePage.screenshot({
      path: 'test-results/debug-firebase-page.png',
    });

    // Let's also check the DOM structure
    console.log('\n=== DOM Structure Comparison ===');
    const forms1 = await page.locator('form').count();
    const forms2 = await firebasePage.locator('form').count();
    console.log('Regular page forms count:', forms1);
    console.log('Firebase page forms count:', forms2);

    const inputs1 = await page.locator('input').count();
    const inputs2 = await firebasePage.locator('input').count();
    console.log('Regular page inputs count:', inputs1);
    console.log('Firebase page inputs count:', inputs2);

    // This test is for debugging - we don't need it to pass/fail
    expect(true).toBeTruthy();
  });

  test('test firebasePage navigation timing', async ({ firebasePage }) => {
    console.log('=== Testing firebasePage navigation timing ===');

    // Check initial state
    console.log('Initial URL:', firebasePage.url());

    // Navigate and wait for network idle
    await firebasePage.goto(`${TEST_CONFIG.baseUrl}/auth/login`, {
      waitUntil: 'networkidle',
    });

    console.log('After goto URL:', firebasePage.url());
    console.log('After goto title:', await firebasePage.title());

    // Wait a bit more to ensure Angular has loaded
    await firebasePage.waitForTimeout(2000);

    // Check if Firebase config was applied
    const hasEmulatorConfig = await firebasePage.evaluate(() => {
      return !!(window as any).__FIREBASE_EMULATOR_CONFIG__;
    });
    console.log('Has emulator config after navigation:', hasEmulatorConfig);

    // Try to find elements
    const authPage = new AuthPage(firebasePage);

    console.log('Looking for form elements...');
    const emailExists = await authPage.emailInput
      .isVisible()
      .catch(() => false);
    const passwordExists = await authPage.passwordInput
      .isVisible()
      .catch(() => false);
    const loginExists = await authPage.loginButton
      .isVisible()
      .catch(() => false);

    console.log('Email input visible:', emailExists);
    console.log('Password input visible:', passwordExists);
    console.log('Login button visible:', loginExists);

    // If elements don't exist, let's see what's on the page
    if (!emailExists) {
      const pageContent = await firebasePage.content();
      console.log('Page HTML length:', pageContent.length);
      console.log(
        'Page contains "email":',
        pageContent.toLowerCase().includes('email')
      );
      console.log(
        'Page contains "password":',
        pageContent.toLowerCase().includes('password')
      );
      console.log(
        'Page contains "login":',
        pageContent.toLowerCase().includes('login')
      );

      // Look for any inputs
      const allInputs = await firebasePage.locator('input').all();
      console.log('Total inputs found:', allInputs.length);

      for (let i = 0; i < allInputs.length; i++) {
        const input = allInputs[i];
        const type = await input.getAttribute('type');
        const placeholder = await input.getAttribute('placeholder');
        const id = await input.getAttribute('id');
        console.log(
          `Input ${i}: type=${type}, placeholder=${placeholder}, id=${id}`
        );
      }
    }

    expect(true).toBeTruthy();
  });
});
