import { expect, type Page } from '@playwright/test';
import { AuthPage } from '../pages/auth.page';
import type { SeedUser } from '../seed/types';

// Generous: the first post-login navigation of a run lazy-loads route chunks
// the ng dev server may still be compiling (observed at 5+ s).
const LANDING_TIMEOUT_MS = 30_000;

/**
 * Signs a seeded user in through the login UI and waits until the app has
 * landed: the authenticated shell (desktop logout button) is showing, the
 * post-login redirect has left /auth/login (to /expenses, or Groups for a
 * user with no group), and the loading overlay is gone.
 *
 * Drives the form directly rather than via AuthPage.login(), which sleeps
 * and swallows a failed sign-in. A rejected sign-in surfaces the login
 * snackbar, which fails this immediately with the user's email.
 */
export async function signInAs(page: Page, user: SeedUser): Promise<void> {
  const authPage = new AuthPage(page);
  const context = `signInAs(${user.key} <${user.email}>)`;

  await page.goto('/auth/login');
  await expect(authPage.emailInput).toBeVisible({ timeout: LANDING_TIMEOUT_MS });
  await authPage.emailInput.fill(user.email);
  await authPage.passwordInput.fill(user.password);
  await expect(authPage.emailInput).toHaveValue(user.email);
  await expect(authPage.passwordInput).toHaveValue(user.password);
  await expect(authPage.loginButton).toBeEnabled();
  await authPage.loginButton.click();

  const authenticated = page
    .getByTestId('logout-button-desktop')
    .filter({ visible: true });
  const loginError = page.getByTestId('snackbar');
  await expect(
    authenticated.or(loginError).first(),
    `${context}: neither the authenticated shell nor a login error appeared`
  ).toBeVisible({ timeout: LANDING_TIMEOUT_MS });
  if (await loginError.first().isVisible()) {
    const message = (await loginError.first().innerText()).split('\n')[0];
    throw new Error(`${context}: sign-in rejected - "${message}"`);
  }

  await expect(page, `${context}: never redirected away from login`).not.toHaveURL(
    /\/auth\/login/,
    { timeout: LANDING_TIMEOUT_MS }
  );
  await expect(
    page.getByTestId('loading-spinner-container'),
    `${context}: loading overlay never cleared`
  ).toBeHidden({ timeout: LANDING_TIMEOUT_MS });
}
