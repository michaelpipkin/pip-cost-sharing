import { expect, test } from '../fixtures';
import { AccountActionPage } from '../pages/account-action.page';
import { AuthPage } from '../pages/auth.page';
import { getSeedAdmin } from '../seed/admin';
import { ACCOUNT_ACTION, CHANGE_EMAILS } from '../seed/datasets/account-action';
import { changeEmailPath, verifyEmailPath } from '../utils/auth-emulator';
import { signInAs } from '../utils/session';

// The verify-email screen (/auth/account-action?mode=verifyEmail&oobCode=...)
// as a user sees it. Every user is seeded unverified (see
// e2e/seed/datasets/account-action.ts) and each test verifies or sends mail
// for its own. Links come from the Admin SDK on the test Auth emulator
// (verifyEmailPath), so no test depends on the app's send button. Whether the
// emulator reports the address verified is read back with the Admin SDK.
//
// Scenarios are the stable ones: a signed-out visitor (the realistic case of
// following the emailed link in another browser), a signed-in unverified user
// (held on Account by the auth guard, so the card is not raced by a redirect),
// a link used twice, and a bad link. A verified user with a group is moved on
// almost at once, so that case is left to verifyEmailViaEmulator.

const BAD_CODE_PATH = '/auth/account-action?mode=verifyEmail&oobCode=not-a-code';
const INVALID_LINK_MESSAGE =
  'Failed to verify email. The link is invalid or has expired.';

async function isVerified(uid: string): Promise<boolean> {
  return (await getSeedAdmin().auth.getUser(uid)).emailVerified;
}

test.describe('Verify email screen', { tag: ['@auth'] }, () => {
  test('should confirm the address for a signed-out visitor', async ({
    page,
  }) => {
    const action = new AccountActionPage(page);
    const { signedOut: user } = ACCOUNT_ACTION.users;
    expect(await isVerified(user.uid)).toBe(false);

    await action.open(await verifyEmailPath(user.email));

    await expect(action.title).toHaveText('Email Verification');
    await expect(action.successMessage).toHaveText(
      "You've successfully confirmed your email address!"
    );
    await expect(action.successHint).toHaveText(
      'You can now log in to your account.'
    );
    await expect(action.continueToLogin).toBeVisible();
    await expect(action.continueToAccount).toBeHidden();
    await expect(action.error).toBeHidden();
    expect(await isVerified(user.uid)).toBe(true);

    await action.continueToLogin.click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(new AuthPage(page).loginButton).toBeVisible();
  });

  test('should confirm the address for a signed-in user', async ({ page }) => {
    const action = new AccountActionPage(page);
    const { signedIn: user } = ACCOUNT_ACTION.users;

    // An unverified user signs in and is held on Account.
    await signInAs(page, user);
    await expect(page).toHaveURL(/\/auth\/account/);
    expect(await isVerified(user.uid)).toBe(false);

    await action.open(await verifyEmailPath(user.email));

    await expect(action.successMessage).toHaveText(
      "You've successfully confirmed your email address!"
    );
    await expect(action.successHint).toHaveText(
      'You can now access all features of the app.'
    );
    await expect(action.continueToAccount).toBeVisible();
    await expect(action.continueToLogin).toBeHidden();
    expect(await isVerified(user.uid)).toBe(true);
  });

  test('should reject a link that was already used', async ({ page }) => {
    const action = new AccountActionPage(page);
    const { reuse: user } = ACCOUNT_ACTION.users;
    const path = await verifyEmailPath(user.email);

    await action.open(path);
    await expect(action.success).toBeVisible();

    await action.open(path);
    await expect(action.error).toBeVisible();
    await expect(action.errorMessage).toHaveText(INVALID_LINK_MESSAGE);
    await expect(action.success).toBeHidden();
    await expect(action.backToLogin).toBeVisible();
    await expect(action.resendButton).toBeHidden();
  });

  test('should reject an unknown code', async ({ page }) => {
    const action = new AccountActionPage(page);

    await action.open(BAD_CODE_PATH);

    await expect(action.errorMessage).toHaveText(INVALID_LINK_MESSAGE);
    await expect(action.success).toBeHidden();
    await expect(action.backToLogin).toBeVisible();
    await action.backToLogin.click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('should reject a link with no code', async ({ page }) => {
    const action = new AccountActionPage(page);

    await action.open('/auth/account-action?mode=verifyEmail');

    await expect(action.errorMessage).toHaveText(
      'Invalid link. No code provided.'
    );
    await expect(action.success).toBeHidden();
  });

  test('should let a signed-in user resend the verification email after a bad link', async ({
    page,
  }) => {
    const action = new AccountActionPage(page);
    const { resend: user } = ACCOUNT_ACTION.users;

    await signInAs(page, user);
    await expect(page).toHaveURL(/\/auth\/account/);

    await action.open(BAD_CODE_PATH);
    await expect(action.errorMessage).toHaveText(INVALID_LINK_MESSAGE);
    await expect(action.backToAccount).toBeVisible();
    await expect(action.backToLogin).toBeHidden();

    await action.resendButton.click();
    await expect(
      action.snackbarWith('Verification email sent! Please check your inbox')
    ).toBeVisible();
    // Still unverified: resending only issues a new link.
    expect(await isVerified(user.uid)).toBe(false);
  });
});

// The change-email screen (/auth/account-action?mode=verifyAndChangeEmail&
// oobCode=...): the link verifyBeforeUpdateEmail sends to the NEW address.
// Links come from the Admin SDK (changeEmailPath). Each test moves its own
// verified user to an address that is never seeded, so each is one-shot per
// seeding. A verified user with a group is not moved off this page.

async function profileEmails(uid: string): Promise<unknown[]> {
  const data = (await getSeedAdmin().db.doc(`users/${uid}`).get()).data();
  return [data?.['email'], data?.['emailLower']];
}

test.describe('Change email screen', { tag: ['@auth', '@account'] }, () => {
  test('should move a signed-in user to the new address and update their profile', async ({
    page,
  }) => {
    const action = new AccountActionPage(page);
    const { changeIn: user } = ACCOUNT_ACTION.users;
    const newEmail = CHANGE_EMAILS.changeIn;

    await signInAs(page, user);
    await action.open(await changeEmailPath(user.email, newEmail));

    await expect(action.title).toHaveText('Email Change');
    await expect(action.successMessage).toHaveText(
      'Your new email address is confirmed!'
    );
    await expect(action.successHint).toHaveText(
      `You now sign in with ${newEmail}.`
    );
    await expect(action.continueToAccount).toBeVisible();
    const changed = await getSeedAdmin().auth.getUser(user.uid);
    expect(changed.email).toBe(newEmail);
    expect(changed.emailVerified).toBe(true);
    // The app wrote the verified address to the profile (the rules accept
    // only the caller's verified token address there).
    await expect
      .poll(() => profileEmails(user.uid), {
        message: 'users/{uid} never got the new email',
        timeout: 30_000,
      })
      .toEqual([newEmail, newEmail]);
  });

  test('should confirm the change for a signed-out visitor, and the next sign-in updates the profile', async ({
    page,
  }) => {
    const action = new AccountActionPage(page);
    const { changeOut: user } = ACCOUNT_ACTION.users;
    const newEmail = CHANGE_EMAILS.changeOut;

    await action.open(await changeEmailPath(user.email, newEmail));

    await expect(action.title).toHaveText('Email Change');
    await expect(action.successMessage).toHaveText(
      'Your email address has been changed. Please sign in with your new address.'
    );
    await expect(action.successHint).toBeHidden();
    await expect(action.continueToLogin).toBeVisible();
    expect((await getSeedAdmin().auth.getUser(user.uid)).email).toBe(newEmail);
    // Nobody was signed in to write it yet.
    expect(await profileEmails(user.uid)).toEqual([user.email, user.email]);

    await action.continueToLogin.click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(signInAs(page, user)).rejects.toThrow(/sign-in rejected/);
    await signInAs(page, { ...user, email: newEmail });
    await expect
      .poll(() => profileEmails(user.uid), {
        message: 'the sign-in never synced the new email',
        timeout: 30_000,
      })
      .toEqual([newEmail, newEmail]);
  });
});
