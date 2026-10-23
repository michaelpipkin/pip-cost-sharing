import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { AccountPage } from '../pages/account.page';
import { GroupEmailUpdateDialog } from '../pages/group-email-update-dialog';
import { MembersPage } from '../pages/members.page';
import { getSeedAdmin } from '../seed/admin';
import {
  CUSTOM_EMAIL,
  GROUP_EMAIL_UPDATE,
  newEmailFor,
} from '../seed/datasets/group-email-update';
import { SHARED } from '../seed/datasets/shared';
import type { SeedUser } from '../seed/types';
import { confirmEmailChangeViaEmulator } from '../utils/auth-emulator';
import { signInAs } from '../utils/session';

// B20: after a login-email change the app offers to update the user's group
// member emails. Each test has its own user with three linked memberships
// (see e2e/seed/datasets/group-email-update.ts): two on the login email and,
// once the test has set it, one on a custom address. The journey is the
// production one: request the change on Account > Profile, sign out, open the
// emailed link while signed out (the usual end state, since a confirmed
// change revokes the session), and sign in with the new address, which
// stores it on the profile and so triggers the offer.

const { memberKey } = GROUP_EMAIL_UPDATE;

type Variant = keyof typeof GROUP_EMAIL_UPDATE.users;

/** The member email in each of the user's three groups, in a/b/c order. */
async function memberEmails(variant: Variant): Promise<string[]> {
  const { db } = getSeedAdmin();
  return Promise.all(
    GROUP_EMAIL_UPDATE.groups[variant].map(async (group) => {
      const data = (
        await db.doc(`groups/${group.key}/members/${memberKey}`).get()
      ).data();
      return data?.['email'] as string;
    })
  );
}

/** Gives the member in the `-c` group a custom address (not the login one). */
async function setCustomEmailInGroupC(variant: Variant): Promise<void> {
  const groupC = GROUP_EMAIL_UPDATE.groups[variant][2]!;
  await getSeedAdmin()
    .db.doc(`groups/${groupC.key}/members/${memberKey}`)
    .update({
      email: CUSTOM_EMAIL,
      emailLower: CUSTOM_EMAIL.toLowerCase(),
    });
}

/** Sets the user's member email in group `index` (0 = a, 1 = b, 2 = c). */
async function setMemberEmail(
  variant: Variant,
  index: number,
  email: string
): Promise<void> {
  const group = GROUP_EMAIL_UPDATE.groups[variant][index]!;
  await getSeedAdmin()
    .db.doc(`groups/${group.key}/members/${memberKey}`)
    .update({ email, emailLower: email.toLowerCase() });
}

/**
 * Gives another member of the `-b` group `email` (by default the variant's
 * new login address), so updating the user's membership there would
 * duplicate it. The row is linked to an account id that has no users doc, so
 * linkInvitedMembers (which links only unlinked rows) never hands it to the
 * test user when they verify the address.
 */
async function takeAddressInGroupB(
  variant: Variant,
  email = newEmailFor(variant)
): Promise<void> {
  const groupB = GROUP_EMAIL_UPDATE.groups[variant][1]!;
  const { db } = getSeedAdmin();
  await db.doc(`groups/${groupB.key}/members/conflict`).set({
    displayName: 'Address Taken',
    email,
    emailLower: email,
    active: true,
    groupAdmin: false,
    userRef: db.doc(`users/u-group-email-${variant}-conflict`),
  });
}

/**
 * Changes the user's login email the way production does and signs in with
 * the new address; the app then offers the update.
 */
async function changeLoginEmailAndSignIn(
  page: Page,
  user: SeedUser,
  newEmail: string
): Promise<void> {
  const account = new AccountPage(page);
  const { db } = getSeedAdmin();

  await signInAs(page, user);
  await account.gotoAccount();
  await account.submitEmailChange(newEmail);
  await expect(
    account.snackbarWith(
      `Check ${newEmail} for a link to confirm your new email`
    )
  ).toBeVisible();
  await account.signOut();

  // Signed out, the link only changes the Auth account; the profile (and the
  // offer) wait for the next sign-in.
  await confirmEmailChangeViaEmulator(page, user.uid, user.email, newEmail);
  expect((await db.doc(`users/${user.uid}`).get()).data()?.['email']).toBe(
    user.email
  );

  await signInAs(page, { ...user, email: newEmail });
}

test.describe(
  'Group email update after a login-email change',
  { tag: ['@account', '@auth'] },
  () => {
    test('should show help text on the Profile sync button', async ({
      page,
    }) => {
      // Read only, as a shared user (signing in writes nothing): Account >
      // Profile of a user with a verified email.
      const account = new AccountPage(page);
      await signInAs(page, SHARED.users.alice);
      await account.gotoAccount();

      await expect(account.syncMemberEmails).toBeVisible();
      await expect(account.syncMemberEmailsHelp).toHaveText(
        'Sets the email on every group membership to your login email, including addresses you set for a particular group.'
      );
    });

    // Profile's own button, with no login-email change.
    test('Profile’s Sync Member Emails moves memberships to the login email and skips a group where it is taken', async ({
      page,
    }) => {
      const user = GROUP_EMAIL_UPDATE.users.sync;
      const account = new AccountPage(page);

      // Reset to the test's start state, so it repeats: A on the login
      // email, B and C on a custom address, and another member of B on the
      // login email.
      await setMemberEmail('sync', 0, user.email);
      await setMemberEmail('sync', 1, CUSTOM_EMAIL);
      await setMemberEmail('sync', 2, CUSTOM_EMAIL);
      await takeAddressInGroupB('sync', user.email);

      await signInAs(page, user);
      await account.gotoAccount();
      await account.syncMemberEmailsButton.click();

      await expect(
        account.snackbarWith(
          'Updated email on 1 member record. 1 skipped because another member of that group already uses that address.'
        )
      ).toBeVisible();
      await expect
        .poll(() => memberEmails('sync'))
        .toEqual([user.email, CUSTOM_EMAIL, user.email]);
    });

    test('"Update old email only" changes the memberships on the old login email and keeps the custom one', async ({
      page,
    }) => {
      const user = GROUP_EMAIL_UPDATE.users.old;
      const newEmail = newEmailFor('old');
      const dialog = new GroupEmailUpdateDialog(page);

      await setCustomEmailInGroupC('old');
      expect(await memberEmails('old')).toEqual([
        user.email,
        user.email,
        CUSTOM_EMAIL,
      ]);

      await changeLoginEmailAndSignIn(page, user, newEmail);

      await dialog.expectOpen();
      await expect(dialog.intro).toHaveText(
        `Your login email is now ${newEmail}. Group emails, such as payment requests, go to the address on each group membership.`
      );
      await expect(dialog.oldLine).toHaveText(
        `2 memberships still use your old login email, ${user.email}.`
      );
      await expect(dialog.otherLine).toHaveText(
        '1 membership uses a different address you set for that group.'
      );
      await expect(dialog.allHelp).toHaveText(
        `Update all: Every membership switches to ${newEmail}.`
      );
      await expect(dialog.oldOnlyHelp).toHaveText(
        `Update old email only: Only memberships using ${user.email} switch; addresses you set for a group are kept.`
      );
      await expect(dialog.laterNote).toHaveText(
        'You can also update all of them later from Account > Profile.'
      );
      await expect(dialog.notNowButton).toBeVisible();
      await expect(dialog.oldOnlyButton).toBeVisible();
      await expect(dialog.updateAllButton).toBeVisible();

      await dialog.choose(dialog.oldOnlyButton);

      await expect(
        dialog.snackbarWith('Updated email on 2 member records')
      ).toBeVisible();
      await expect
        .poll(() => memberEmails('old'))
        .toEqual([newEmail, newEmail, CUSTOM_EMAIL]);
    });

    test('"Update all" changes every membership, the custom one too, and skips a group where the address is taken', async ({
      page,
    }) => {
      const user = GROUP_EMAIL_UPDATE.users.all;
      const newEmail = newEmailFor('all');
      const dialog = new GroupEmailUpdateDialog(page);

      await setCustomEmailInGroupC('all');
      await takeAddressInGroupB('all');

      await changeLoginEmailAndSignIn(page, user, newEmail);

      await dialog.expectOpen();
      await expect(dialog.oldOnlyButton).toBeVisible();
      await dialog.choose(dialog.updateAllButton);

      // M2: the server's duplicate check leaves group B on the old address.
      await expect(
        dialog.snackbarWith(
          'Updated email on 2 member records. 1 skipped because another member of that group already uses that address.'
        )
      ).toBeVisible();
      await expect
        .poll(() => memberEmails('all'))
        .toEqual([newEmail, user.email, newEmail]);
    });

    test('"Not now" changes nothing, and the dialog is not offered again', async ({
      page,
    }) => {
      const user = GROUP_EMAIL_UPDATE.users.skip;
      const newEmail = newEmailFor('skip');
      const dialog = new GroupEmailUpdateDialog(page);
      const account = new AccountPage(page);
      const members = new MembersPage(page);

      await setCustomEmailInGroupC('skip');

      await changeLoginEmailAndSignIn(page, user, newEmail);

      await dialog.expectOpen();
      await dialog.choose(dialog.notNowButton);

      expect(await memberEmails('skip')).toEqual([
        user.email,
        user.email,
        CUSTOM_EMAIL,
      ]);

      // Shown once per change: signing in again, with the profile already on
      // the new address, offers nothing.
      await account.gotoAccount();
      await account.signOut();
      await signInAs(page, { ...user, email: newEmail });
      // An offer would open a modal as soon as the sign-in landed, and a
      // modal blocks the nav click below, so this fails if one appears; the
      // members page also shows the membership counting has finished.
      await members.goto();
      await expect(members.currentGroupName).toHaveText(
        GROUP_EMAIL_UPDATE.groups.skip[0]!.name
      );
      await expect(dialog.dialog).toBeHidden();
      expect(await memberEmails('skip')).toEqual([
        user.email,
        user.email,
        CUSTOM_EMAIL,
      ]);
    });
  }
);
