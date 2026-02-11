import { TEST_CONFIG } from '../constants';
import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
// Use our fixtures for Firebase emulator integration

test.describe('Authentication - Authenticated User Tests', () => {
  test('should connect to Firebase emulators', async ({ page }) => {
    // Test Firebase emulator connectivity before running authenticated tests

    // Test Firestore emulator
    const firestoreResponse = await page.request.get('http://127.0.0.1:8080');
    expect(firestoreResponse.ok()).toBeTruthy();

    // Test Auth emulator
    const authResponse = await page.request.get('http://127.0.0.1:9099');
    expect(authResponse.ok()).toBeTruthy();
  });

  test('should create test user and login successfully', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    // This will create a user in Firebase Auth emulator and login
    await authPage.createAndLoginTestUser();

    // Check that we're logged in - isLoggedIn() handles its own waits
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBeTruthy();

    // Verify we're redirected away from login page
    const currentUrl = preserveDataFirebasePage.url();
    expect(currentUrl).not.toContain('/auth/login');
  });

  test('should redirect authenticated users away from login page', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    // First create and login a test user
    await authPage.createAndLoginTestUser();

    // Verify we're logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBeTruthy();

    // Now try to navigate to login page - should be redirected
    await preserveDataFirebasePage.goto(`${TEST_CONFIG.baseUrl}/auth/login`);
    await preserveDataFirebasePage.waitForSelector('app-root', { timeout: 10000 });

    // Should not be on login page anymore - authGuard should redirect
    const currentUrl = preserveDataFirebasePage.url();
    expect(currentUrl).not.toContain('/auth/login');
  });

  test('should redirect authenticated users away from register page', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    // First create and login a test user
    await authPage.createAndLoginTestUser();

    // Verify we're logged in
    const isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBeTruthy();

    // Now try to navigate to register page - should be redirected
    await preserveDataFirebasePage.goto(`${TEST_CONFIG.baseUrl}/auth/register`);
    await preserveDataFirebasePage.waitForSelector('app-root', { timeout: 10000 });

    // Should not be on register page anymore - authGuard should redirect
    const currentUrl = preserveDataFirebasePage.url();
    expect(currentUrl).not.toContain('/auth/register');
  });

  test('should allow authenticated user to logout', async ({
    preserveDataFirebasePage,
  }) => {
    const authPage = new AuthPage(preserveDataFirebasePage);

    // First create and login a test user
    await authPage.createAndLoginTestUser();

    // Verify we're logged in
    let isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBeTruthy();

    // Logout (this depends on your app's logout implementation)
    await authPage.logout();

    // Verify we're logged out
    isLoggedIn = await authPage.isLoggedIn();
    expect(isLoggedIn).toBeFalsy();
  });
});
