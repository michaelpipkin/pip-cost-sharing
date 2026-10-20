import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { AUTH } from '../seed/datasets/auth';
import { signInAs } from '../utils/session';

// The seeded auth user (member of "Auth – Home") signs in through the real
// login form. Nothing here mutates data; every test signs in on its own.
const user = AUTH.users.authUser;

test.describe('Authentication - Authenticated User Tests', { tag: '@auth' }, () => {
  test('should sign in and land on the authenticated shell', async ({ page }) => {
    await signInAs(page, user);

    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(page.getByTestId('logout-button-desktop')).toBeVisible();
    await expect(page.getByTestId('nav-login-desktop')).toBeHidden();
  });

  test('should redirect authenticated users away from login page', async ({
    page,
  }) => {
    await signInAs(page, user);

    // loggedInGuard resolves asynchronously after auth initialises, so wait
    // for the redirect instead of reading the URL once.
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(page.getByTestId('logout-button-desktop')).toBeVisible();
  });

  test('should redirect authenticated users away from register page', async ({
    page,
  }) => {
    await signInAs(page, user);

    await page.goto('/auth/register');
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(page.getByTestId('logout-button-desktop')).toBeVisible();
  });

  test('should allow authenticated user to logout', async ({ page }) => {
    const authPage = new AuthPage(page);

    await signInAs(page, user);
    await authPage.logout();

    // Signed-out shell: login link back, logout button gone.
    await expect(page.getByTestId('nav-login-desktop')).toBeVisible();
    await expect(page.getByTestId('logout-button-desktop')).toBeHidden();
  });
});
