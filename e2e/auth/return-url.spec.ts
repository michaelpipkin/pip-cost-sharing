import { expect, test } from '../fixtures';
import { AuthPage } from '../pages/auth.page';
import { MembersPage } from '../pages/members.page';
import { SHARED } from '../seed/datasets/shared';

// B20: the auth guard sends a signed-out visitor to
// /auth/login?returnUrl=<the page they wanted>, and signing in returns them
// there (only to an app-internal path). Read only, as a shared user (signing
// in as alice writes nothing).

const alice = SHARED.users.alice;

test.describe('Sign-in returnUrl', { tag: ['@auth'] }, () => {
  test('should return a signed-out visitor to the page they opened', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    const members = new MembersPage(page);

    await page.goto('/administration/members');
    await expect(page).toHaveURL(
      /\/auth\/login\?returnUrl=%2Fadministration%2Fmembers$/
    );
    await expect(auth.emailInput).toBeVisible();

    await auth.submitLogin(alice.email, alice.password, 'returnUrl sign-in');

    await expect(page).toHaveURL(/\/administration\/members$/);
    await expect(members.currentGroupName).toHaveText(
      SHARED.group.name
    );
  });

  test("should keep a one-time link's token until its page reads it", async ({
    page,
  }) => {
    const auth = new AuthPage(page);

    await page.goto('/auth/confirm-group-email?token=bogus-token-123');
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=/);
    expect(new URL(page.url()).searchParams.get('returnUrl')).toBe(
      '/auth/confirm-group-email?token=bogus-token-123'
    );
    await expect(auth.emailInput).toBeVisible();

    // The page reads the token (sending it to the callable) after sign-in.
    const confirmRequest = page.waitForRequest(
      (request) =>
        request.url().includes('confirmMemberEmailChange') &&
        request.method() === 'POST',
      { timeout: 60_000 }
    );
    await auth.submitLogin(alice.email, alice.password, 'token sign-in');

    expect((await confirmRequest).postData()).toContain('bogus-token-123');
    // A cold confirmMemberEmailChange can take 20+ s on its first call.
    await expect(page.getByTestId('confirm-group-email-error')).toHaveText(
      "This link has expired or was already used. Request a new one from the group's Members page.",
      { timeout: 60_000 }
    );
    // The page then takes the token out of the URL.
    await expect(page).toHaveURL(/\/auth\/confirm-group-email$/);
  });

  test('should ignore a returnUrl that leaves the app', async ({ page }) => {
    const auth = new AuthPage(page);

    await page.goto('/auth/login?returnUrl=%2F%2Fevil.example%2Fphish');
    await expect(auth.emailInput).toBeVisible();

    await auth.submitLogin(alice.email, alice.password, 'open-redirect sign-in');

    await expect(page).toHaveURL(/\/expenses/);
    expect(new URL(page.url()).hostname).not.toBe('evil.example');
  });
});
