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
 */
export async function signInAs(page: Page, user: SeedUser): Promise<void> {
  const authPage = new AuthPage(page);
  await authPage.gotoLogin();
  await authPage.login(user.email, user.password);

  const context = `signInAs(${user.key})`;
  await expect(
    page.getByTestId('logout-button-desktop').filter({ visible: true }),
    `${context}: authenticated shell never appeared`
  ).toBeVisible({ timeout: LANDING_TIMEOUT_MS });
  await expect(page, `${context}: never redirected away from login`).not.toHaveURL(
    /\/auth\/login/,
    { timeout: LANDING_TIMEOUT_MS }
  );
  await expect(
    page.getByTestId('loading-spinner-container'),
    `${context}: loading overlay never cleared`
  ).toBeHidden({ timeout: LANDING_TIMEOUT_MS });
}
