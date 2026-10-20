import { expect, test } from '../fixtures';
import { AccountPage } from '../pages/account.page';
import { AuthPage } from '../pages/auth.page';
import { GroupsPage } from '../pages/groups.page';
import { MembersPage } from '../pages/members.page';
import { INVITES } from '../seed/datasets/invites';
import { findMail, verifyEmailViaEmulator } from '../utils/auth-emulator';
import { signInAs } from '../utils/session';

// Every test works on its own member of "Invites – Main" (see
// e2e/seed/datasets/invites.ts), so they run in any order and in parallel.
// The mail and link chains run through the real Cloud Functions, which take
// 20-60 s on cold functions: those waits are polls on the outcome, with a
// generous bound.

const { users, group, invitees } = INVITES;

// Bounds for waits on trigger-driven outcomes (mail queue, member link).
const FUNCTION_CHAIN_TIMEOUT_MS = 120_000;

test.describe('Group invites', { tag: ['@members', '@groups'] }, () => {
  test('should send an invite and start the cooldown', async ({ page }) => {
    const members = new MembersPage(page);
    const { send } = invitees;

    await signInAs(page, users.admin);
    await members.goto();
    await expect(members.inviteButton(send.key)).toBeVisible();

    await members.sendInvite(send.key);
    await expect(
      members.snackbarWith(`Invitation sent to ${send.email}`)
    ).toBeVisible();
    // The invite is recorded on the member, so the cooldown hides the envelope.
    await expect(members.inviteButton(send.key)).toHaveCount(0);
    await expect(members.row(send.key)).toBeVisible();

    // sendMailQueueEmail marks the queued mail SUCCESS (suppressed under the
    // demo- test project) once its trigger runs.
    await expect
      .poll(
        async () => {
          const mail = await findMail(send.email);
          return mail
            ? {
                subject: mail['message']?.subject,
                state: mail['delivery']?.state,
                messageId: mail['delivery']?.info?.messageId,
              }
            : null;
        },
        {
          message: `no delivered invite mail for ${send.email}`,
          timeout: FUNCTION_CHAIN_TIMEOUT_MS,
        }
      )
      .toEqual({
        subject: `You're invited to join ${group.name} on PipSplit`,
        state: 'SUCCESS',
        messageId: 'suppressed',
      });
  });

  test('should only offer invites to unregistered, active members with an email', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const account = new AccountPage(page);
    const { eligible, cooldown, inactive, blank } = invitees;

    await signInAs(page, users.admin);
    await members.goto();
    // The members who can be invited have an envelope (and so the column
    // exists); everyone else is listed without one.
    await expect(members.inviteColumnHeader).toBeVisible();
    await expect(members.inviteButton(eligible.key)).toBeVisible();
    // Inactive members are hidden by the default Active-only filter.
    await members.toggleActiveOnly();
    for (const key of [
      ...INVITES.linkedMemberKeys,
      cooldown.key,
      inactive.key,
      blank.key,
    ]) {
      await expect(members.row(key)).toBeVisible();
      await expect(members.inviteButton(key)).toHaveCount(0);
    }

    // A non-admin never gets the column, even with invitable members listed.
    await account.signOut();
    await signInAs(page, users.viewer);
    await members.goto();
    await expect(members.row(eligible.key)).toBeVisible();
    await expect(members.inviteColumnHeader).toHaveCount(0);
    await expect(members.inviteButton(eligible.key)).toHaveCount(0);
  });

  test('should link an invited member when they register', async ({ page }) => {
    const auth = new AuthPage(page);
    const members = new MembersPage(page);
    const groups = new GroupsPage(page);
    const account = new AccountPage(page);
    const { register } = invitees;

    // Start state: the admin can still invite this member.
    await signInAs(page, users.admin);
    await members.goto();
    await expect(members.inviteButton(register.key)).toBeVisible();
    await account.signOut();

    // The one runtime Auth user in the suite: registering is what is tested.
    await auth.gotoSignUp();
    await auth.register(register.email, users.admin.password);
    await verifyEmailViaEmulator(page, register.email);

    // Verifying links the member (linkInvitedMembers) and the app moves the
    // new user on to Groups; the group shows up in its select once the
    // syncGroupMemberUids trigger has granted access to it.
    await expect(page).toHaveURL(/\/administration\/groups$/);
    await expect(async () => {
      await groups.verifyGroupInList(group.name);
    }).toPass({ timeout: FUNCTION_CHAIN_TIMEOUT_MS });

    // The member is linked now, so the admin has nobody left to invite there.
    await account.signOut();
    await signInAs(page, users.admin);
    await members.goto();
    await expect(members.inviteButton(invitees.eligible.key)).toBeVisible();
    await expect(members.row(register.key)).toBeVisible();
    await expect(members.inviteButton(register.key)).toHaveCount(0);
  });
});
