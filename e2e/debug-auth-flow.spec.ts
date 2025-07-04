import { TEST_DATA } from './constants';
import { expect, test } from './fixtures';
import { AuthPage } from './pages/auth.page';

test.describe('Debug Authentication Flow', () => {
  test('debug user creation and login process', async ({
    preserveDataFirebasePage,
  }) => {
    console.log('=== Starting debug authentication flow ===');

    const authPage = new AuthPage(preserveDataFirebasePage);

    try {
      console.log('Step 1: Creating test user...');

      // Let's manually create the user to see what happens
      const testEmail = 'test-user@example.com';
      const testPassword = 'testpassword123';

      console.log('Creating user with email:', testEmail);

      // Try the correct Firebase Auth emulator endpoint
      const createUserResponse = await preserveDataFirebasePage.request.post(
        'http://127.0.0.1:9099/www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser?key=fake-api-key',
        {
          data: {
            email: testEmail,
            password: testPassword,
            returnSecureToken: true,
          },
        }
      );

      console.log(
        'User creation response status:',
        createUserResponse.status()
      );
      if (!createUserResponse.ok()) {
        const errorData = await createUserResponse.text();
        console.log('User creation error:', errorData);
      } else {
        const userData = await createUserResponse.json();
        console.log('User created successfully:', userData);
      }

      console.log('Step 1.5: Verifying user was created in emulator...');
      // Check if user exists in Firebase Auth emulator
      const usersResponse = await preserveDataFirebasePage.request.get(
        'http://127.0.0.1:9099/emulator/v1/projects/pip-cost-sharing/accounts'
      );
      const usersData = await usersResponse.json();
      console.log('Users in emulator:', usersData.users?.length || 0);

      if (usersData.users?.length > 0) {
        console.log('User created successfully, now attempting login...');
        await authPage.gotoLogin();
        await authPage.login(testEmail, testPassword);
      } else {
        console.log('No users found in emulator after creation attempt');
      }

      if (usersData.users?.length > 0) {
        const testUser = usersData.users.find(
          (user: any) => user.email === TEST_DATA.testUsers.regularUser.email
        );
        console.log('Test user found in emulator:', !!testUser);
        if (testUser) {
          console.log('Test user email:', testUser.email);
          console.log('Test user emailVerified:', testUser.emailVerified);
        }
      }

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

        // Check for account circle icon (another indicator of logged in state)
        const accountIconVisible = await preserveDataFirebasePage
          .locator('mat-icon:has-text("account_circle")')
          .isVisible()
          .catch(() => false);
        console.log('Account icon visible:', accountIconVisible);

        // Take a screenshot for visual debugging
        await preserveDataFirebasePage.screenshot({
          path: 'test-results/debug-login-state.png',
        });

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
        console.log(
          'Page contains "account":',
          bodyText?.toLowerCase().includes('account')
        );
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

    const authPage = new AuthPage(preserveDataFirebasePage);
    const testEmail = 'debug-test@example.com';
    const testPassword = 'testpassword123';

    try {
      console.log('Step 1: Creating user via Firebase emulator API...');
      // This should create a user directly in the Firebase Auth emulator
      const response = await preserveDataFirebasePage.request.post(
        'http://127.0.0.1:9099/emulator/v1/projects/pip-cost-sharing/accounts',
        {
          data: {
            email: testEmail,
            password: testPassword,
            emailVerified: true,
          },
        }
      );

      console.log('User creation response status:', response.status());
      const responseData = await response.json();
      console.log('User creation response:', responseData);

      console.log('Step 2: Trying to login with created user...');
      await authPage.gotoLogin();
      await authPage.login(testEmail, testPassword);

      console.log('Step 3: Checking authentication state...');
      const isLoggedIn = await authPage.isLoggedIn();
      console.log('Is logged in after manual login:', isLoggedIn);

      expect(response.ok()).toBeTruthy();
    } catch (error) {
      console.error('Error during Firebase emulator test:', error.message);
      await preserveDataFirebasePage.screenshot({
        path: 'test-results/debug-firebase-error.png',
      });
      throw error;
    }
  });
});
