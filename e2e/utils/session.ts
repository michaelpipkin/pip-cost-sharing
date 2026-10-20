import { type Page } from '@playwright/test';
import { AuthPage } from '../pages/auth.page';
import type { SeedUser } from '../seed/types';

/**
 * Signs a seeded user in through the login UI and waits until the app has
 * landed: the authenticated shell (desktop logout button) is showing, the
 * post-login redirect has left /auth/login (to /expenses, or Groups for a
 * user with no group), and the loading overlay is gone.
 *
 * Shares AuthPage.submitLogin with AuthPage.login(). A rejected sign-in
 * surfaces the login snackbar, which fails this immediately with the user's
 * email.
 */
export async function signInAs(page: Page, user: SeedUser): Promise<void> {
  const authPage = new AuthPage(page);
  await authPage.gotoLogin();
  await authPage.submitLogin(
    user.email,
    user.password,
    `signInAs(${user.key} <${user.email}>)`
  );
}
