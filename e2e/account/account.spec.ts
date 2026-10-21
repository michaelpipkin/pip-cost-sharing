import { expect, test } from '../fixtures';
import { AccountPage } from '../pages/account.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { getSeedAdmin } from '../seed/admin';
import { ACCOUNT, NEW_EMAIL, NEW_PASSWORD } from '../seed/datasets/account';
import { verifyEmailViaEmulator } from '../utils/auth-emulator';
import { signInAs } from '../utils/session';

// Each test signs in as its own user (see e2e/seed/datasets/account.ts): they
// all change one-way user state or group membership. Journeys are in-app
// (header account button, then the sidebar); Preferences has no sidebar link,
// so it is opened by URL once the account page has rendered. Persistence is
// checked with a real reload, which makes the page read from Firestore.
//
// The email tests go through Firebase's updateEmail and the Auth emulator's
// emailed-link code (verifyEmailViaEmulator), reading the Auth account and
// users/{uid} back with the Admin SDK on the test emulators.

test.describe('Account settings', { tag: ['@account'] }, () => {
  test('should save payment service IDs', async ({ page }) => {
    const account = new AccountPage(page);
    const ids = {
      venmo: 'ari-venmo',
      paypal: 'ari@paypal.example',
      cashApp: '$arican',
      zelle: 'ari-zelle@example.com',
    };

    await signInAs(page, ACCOUNT.users.payments);
    await account.gotoAccount();
    await account.openSection('payments');
    await account.fillPaymentIds(ids);
    await account.savePaymentIds();

    await account.reloadTo('payments');
    await account.expectPaymentIds(ids);
  });

  test('should turn email notifications off and on', async ({ page }) => {
    const account = new AccountPage(page);
    const toggle = account.emailNotificationsToggle;

    await signInAs(page, ACCOUNT.users.notify);
    await account.gotoAccount();
    await account.openSection('profile');
    await expect(account.switchOf(toggle)).toBeChecked();

    await account.setSwitch(toggle, false);
    await expect(
      account.snackbarWith('Email notifications disabled')
    ).toBeVisible();
    await account.reloadTo('profile');
    await expect(account.switchOf(toggle)).not.toBeChecked();

    await account.setSwitch(toggle, true);
    await expect(
      account.snackbarWith('Email notifications enabled')
    ).toBeVisible();
    await account.reloadTo('profile');
    await expect(account.switchOf(toggle)).toBeChecked();
  });

  test('should accept the receipt policy', async ({ page }) => {
    const account = new AccountPage(page);

    await signInAs(page, ACCOUNT.users.legal);
    await account.gotoAccount();
    await account.openSection('legal');
    await expect(account.policyAccepted).toBeHidden();
    await account.acceptReceiptPolicy();
    await expect(account.policyAccepted).toBeVisible();

    await account.reloadTo('legal');
    await expect(account.policyAccepted).toBeVisible();
    await expect(account.acceptPolicyButton).toBeHidden();
  });

  test('should save a default group', async ({ page }) => {
    const account = new AccountPage(page);
    const expenses = new ExpensesPage(page);

    await signInAs(page, ACCOUNT.users.prefs);
    await expenses.waitForList();
    await expect(expenses.currentGroupName).toHaveText(
      ACCOUNT.groups.prefsA.name
    );

    await account.gotoAccount();
    await account.openPreferences();
    await expect(account.defaultGroupSelect).toHaveText(
      ACCOUNT.groups.prefsA.name
    );
    await account.saveDefaultGroup(ACCOUNT.groups.prefsB.name);

    await account.signOut();
    await signInAs(page, ACCOUNT.users.prefs);
    await expenses.waitForList();
    await expect(expenses.currentGroupName).toHaveText(
      ACCOUNT.groups.prefsB.name
    );
  });

  test('should change the password', async ({ page }) => {
    const account = new AccountPage(page);
    const { password: user } = ACCOUNT.users;

    await signInAs(page, user);
    await account.gotoAccount();
    await account.openSection('security');
    await account.changePassword(NEW_PASSWORD);
    await expect(
      account.snackbarWith('Your password has been updated')
    ).toBeVisible();

    await account.signOut();
    await expect(signInAs(page, user)).rejects.toThrow(
      /sign-in rejected - "Could not sign you in\. Please check your email and password\."/
    );
    await signInAs(page, { ...user, password: NEW_PASSWORD });
    await expect(account.logoutButton).toBeVisible();
  });

  test('should rejoin a group the user left', async ({ page }) => {
    const account = new AccountPage(page);
    const groups = new GroupsPage(page);
    const left = ACCOUNT.groups.left.name;

    await signInAs(page, ACCOUNT.users.rejoin);
    await groups.goto();
    await groups.verifyGroupNotInList(left);

    await account.gotoAccount();
    await account.openSection('group-membership');
    await account.rejoinGroup(left);
    await expect(account.noLeftGroups).toBeVisible();
    await expect(account.groupMembershipLink).toBeHidden();

    await groups.goto();
    await groups.verifyGroupInList(left);
  });

  test('should change the email address and verify the new one', async ({
    page,
  }) => {
    const account = new AccountPage(page);
    const { email: user } = ACCOUNT.users;
    const { auth, db } = getSeedAdmin();

    await signInAs(page, user);
    await account.gotoAccount();
    await expect(account.emailInput).toHaveValue(user.email);
    await expect(account.verifyEmailButton).toHaveText('Email Verified');
    await expect(account.syncMemberEmails).toBeVisible();

    await account.submitEmailChange(NEW_EMAIL);
    await expect(
      account.snackbarWith('Check your email to verify your email address')
    ).toBeVisible();
    // The profile now treats the address as unverified: the verified-only
    // member email sync is gone and the button offers to verify again.
    await expect(account.syncMemberEmails).toBeHidden();
    await expect(account.verifyEmailButton).toHaveText('Verify Email');
    // The Auth account moved to the new address, unverified.
    const changed = await auth.getUser(user.uid);
    expect(changed.email).toBe(NEW_EMAIL);
    expect(changed.emailVerified).toBe(false);

    // The emailed link for the NEW address verifies it, and the app then
    // writes it to the user doc (the trigger keeps emailLower in step).
    await verifyEmailViaEmulator(page, NEW_EMAIL);
    await expect
      .poll(
        async () => {
          const data = (await db.doc(`users/${user.uid}`).get()).data();
          return [data?.['email'], data?.['emailLower']];
        },
        { message: 'users/{uid} never got the new email', timeout: 30_000 }
      )
      .toEqual([NEW_EMAIL, NEW_EMAIL]);

    // Only the new address signs in now.
    await account.signOut();
    await expect(signInAs(page, user)).rejects.toThrow(
      /sign-in rejected - "Could not sign you in\. Please check your email and password\."/
    );
    await signInAs(page, { ...user, email: NEW_EMAIL });
    await account.gotoAccount();
    await expect(account.emailInput).toHaveValue(NEW_EMAIL);
    await expect(account.verifyEmailButton).toHaveText('Email Verified');
  });

  test('should refuse an email address another account already uses', async ({
    page,
  }) => {
    const account = new AccountPage(page);
    const { inUse: user, taken } = ACCOUNT.users;
    const { auth } = getSeedAdmin();

    await signInAs(page, user);
    await account.gotoAccount();
    await account.submitEmailChange(taken.email);
    await expect(
      account.snackbarWith(
        'This email address is already in use by another account'
      )
    ).toBeVisible();
    await expect(
      account.snackbarWith('Check your email to verify your email address')
    ).toBeHidden();

    expect((await auth.getUser(user.uid)).email).toBe(user.email);
    expect((await auth.getUser(taken.uid)).email).toBe(taken.email);
  });
});
