import { expect, test } from './fixtures';
import { AuthPage } from './pages/auth.page';
import { createTestUser } from './utils/firebase';

test.describe('Debug Authentication Flow', () => {
  test('debug user creation and login process', async ({
    preserveDataFirebasePage,
  }) => {
    console.log('=== Starting debug authentication flow ===');

    const authPage = new AuthPage(preserveDataFirebasePage);

    try {
      console.log('Step 1: Creating and logging in test user...');
      await authPage.createAndLoginTestUser();

      console.log('Step 2: Checking if logged in...');
      const isLoggedIn = await authPage.isLoggedIn();
      console.log('Is logged in:', isLoggedIn);

      if (!isLoggedIn) {
        console.log('Step 3: Debugging why login failed...');

        // Check current page
        console.log('Current URL:', preserveDataFirebasePage.url());
        console.log('Page title:', await preserveDataFirebasePage.title());

        // Check for error messages
        const errorVisible = await authPage.errorMessage
          .isVisible()
          .catch(() => false);
        console.log('Error message visible:', errorVisible);

        if (errorVisible) {
          const errorText = await authPage.errorMessage.textContent();
          console.log('Error message text:', errorText);
        }

        // Check for login button (indicates we're still on login page)
        const loginButtonVisible = await authPage.loginButton
          .isVisible()
          .catch(() => false);
        console.log('Login button still visible:', loginButtonVisible);

        // Check for logout button (indicates we're logged in but selector is wrong)
        const logoutButtonVisible = await preserveDataFirebasePage
          .locator(
            'button:has-text("Logout"), button:has-text("logout"), button:has-text("Log out")'
          )
          .isVisible()
          .catch(() => false);
        console.log('Logout button visible:', logoutButtonVisible);

        // Check for account icon (another indicator of logged in state)
        const accountIconVisible = await preserveDataFirebasePage
          .locator('[data-testid="nav-account-desktop"]')
          .isVisible()
          .catch(() => false);
        console.log('Account icon visible:', accountIconVisible);

        // Take a screenshot for visual debugging
        await preserveDataFirebasePage.screenshot({
          path: 'test-results/debug-login-state.png',
        });
      }

      expect(isLoggedIn).toBeTruthy();
    } catch (error) {
      console.error('Error during authentication flow:', error.message);
      await preserveDataFirebasePage.screenshot({
        path: 'test-results/debug-auth-error.png',
      });
      throw error;
    }
  });

  test('debug Firebase emulator user creation', async ({
    preserveDataFirebasePage,
  }) => {
    console.log('=== Testing Firebase emulator user creation ===');

    const testEmail = `debug-test-${Date.now()}@example.com`;
    const testPassword = 'testpassword123';

    try {
      console.log('Step 1: Creating user via createTestUser utility...');
      const userData = await createTestUser(
        preserveDataFirebasePage,
        testEmail,
        testPassword
      );
      console.log('User created with localId:', userData.localId);

      console.log('Step 2: Verifying user in emulator...');
      // Use idToken from signup to look up the user's current state
      const lookupResponse = await preserveDataFirebasePage.request.post(
        'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key',
        { data: { idToken: userData.idToken } }
      );
      const lookupData = await lookupResponse.json();
      const createdUser = lookupData.users?.[0];
      console.log('User found in emulator:', !!createdUser);
      console.log('User email:', createdUser?.email);
      console.log('User emailVerified:', createdUser?.emailVerified);

      expect(createdUser).toBeTruthy();
      expect(createdUser.email).toBe(testEmail);
      expect(createdUser.emailVerified).toBe(true);

      console.log('Step 3: Trying to login with created user...');
      const authPage = new AuthPage(preserveDataFirebasePage);
      await authPage.gotoLogin();
      await authPage.login(testEmail, testPassword);

      console.log('Step 4: Checking authentication state...');
      const isLoggedIn = await authPage.isLoggedIn();
      console.log('Is logged in after login:', isLoggedIn);

      expect(isLoggedIn).toBeTruthy();
    } catch (error) {
      console.error('Error during Firebase emulator test:', error.message);
      await preserveDataFirebasePage.screenshot({
        path: 'test-results/debug-firebase-error.png',
      });
      throw error;
    }
  });
});
