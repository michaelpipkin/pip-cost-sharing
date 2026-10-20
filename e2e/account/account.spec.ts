import { expect, test } from '../fixtures';
import { AccountPage } from '../pages/account.page';
import { ExpensesPage } from '../pages/expenses.page';
import { GroupsPage } from '../pages/groups.page';
import { ACCOUNT, NEW_PASSWORD } from '../seed/datasets/account';
import { signInAs } from '../utils/session';

// Each test signs in as its own user (see e2e/seed/datasets/account.ts): they
// all change one-way user state or group membership. Journeys are in-app
// (header account button, then the sidebar); Preferences has no sidebar link,
// so it is opened by URL once the account page has rendered. Persistence is
// checked with a real reload, which makes the page read from Firestore.
//
// Changing the email address is not covered: it locks the account into email
// verification (a candidate for later).

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
    await expect(signInAs(page, user)).rejects.toThrow(/sign-in rejected/);
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
});
