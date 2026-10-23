import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { MembersPage } from '../pages/members.page';
import { getSeedAdmin } from '../seed/admin';
import { MEMBER_EMAIL } from '../seed/datasets/member-email';
import { SHARED } from '../seed/datasets/shared';
import { findMail } from '../utils/auth-emulator';
import { signInAs } from '../utils/session';

// Plan 4 B19: group mail goes to a member's group email, so a linked
// member's email may hold only an address its user has proven they own.
// An admin can no longer change it; the member changes it through a link
// mailed to the new address. See e2e/seed/datasets/member-email.ts.

const { users, groups, selfMember, cooldownMember } = MEMBER_EMAIL;

/** The confirmation link's path (the mailed link points at production). */
function confirmPath(mailText: string): string {
  const match = /https?:\/\/[^/\s]+(\/auth\/confirm-group-email\?token=[^\s]+)/.exec(
    mailText
  );
  expect(match, 'confirmation link in the mail text').not.toBeNull();
  return match![1]!;
}

test.describe('Member group email', { tag: ['@members', '@auth'] }, () => {
  test("an admin cannot change a linked member's email", async ({ page }) => {
    // Shared data, read only: Alice (admin) opens Bob's row and cancels.
    const members = new MembersPage(page);
    await signInAs(page, SHARED.users.alice);
    await members.goto();

    await members.clickMemberRow('bob');
    await expect(members.editMemberEmailInput).toBeDisabled();
    await expect(members.editMemberEmailInput).toHaveValue(
      SHARED.users.bob.email
    );
    await expect(members.editMemberEmailHint).toHaveText(
      'Only the member can change their email address once it is linked to their profile.'
    );
    await members.cancelEditMember();
  });

  test('a member changes their own group email through a mailed link', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const row = members.row(selfMember.key);
    const newEmail = `member-email-new-${randomUUID().slice(0, 8)}@pipsplit.test`;

    // Mae's own row back to the seeded address, so the test repeats.
    await getSeedAdmin()
      .db.doc(`groups/${groups.main.key}/members/${selfMember.key}`)
      .update({
        email: selfMember.email,
        emailLower: selfMember.email.toLowerCase(),
      });

    await signInAs(page, users.self);
    await members.goto();
    await expect(members.currentGroupName).toHaveText(groups.main.name);
    await expect(row.getByTestId('member-email-cell')).toHaveText(
      selfMember.email
    );

    await members.editMember(selfMember.key, { email: newEmail });
    await expect(
      members.snackbarWith(
        `We sent a confirmation link to ${newEmail}. Your group email will change once you confirm it.`
      )
    ).toBeVisible();
    // Nothing changes until the link is used.
    await expect(row.getByTestId('member-email-cell')).toHaveText(
      selfMember.email
    );

    // The callable queued the mail to the new address before it answered
    // (delivery is suppressed under demo-*).
    let mailText = '';
    await expect
      .poll(async () => {
        mailText = (await findMail(newEmail))?.['message']?.text ?? '';
        return mailText;
      })
      .toContain('/auth/confirm-group-email?token=');
    // No user-controlled text in it (the random token aside).
    const path = confirmPath(mailText);
    const copy = mailText.replace(path, '');
    expect(copy).not.toContain(selfMember.displayName);
    expect(copy).not.toContain(groups.main.name);
    expect(copy).not.toContain(selfMember.email);

    // A cold confirmMemberEmailChange can take 20+ s on its first call.
    await page.goto(path);
    await expect(page.getByTestId('confirm-group-email-success')).toHaveText(
      `Your group email is now ${newEmail}.`,
      { timeout: 60_000 }
    );
    await members.waitForLoadingComplete();

    await page.getByTestId('confirm-group-email-members-link').click();
    await expect(page).toHaveURL(/\/administration\/members$/);
    await expect(row.getByTestId('member-email-cell')).toHaveText(newEmail);
    const stored = await getSeedAdmin()
      .db.doc(`groups/${groups.main.key}/members/${selfMember.key}`)
      .get();
    expect(stored.get('email')).toBe(newEmail);

    // The link works once.
    await page.goto(path);
    await expect(page.getByTestId('confirm-group-email-error')).toHaveText(
      "This link has expired or was already used. Request a new one from the group's Members page."
    );
  });

  test('a second confirmation to the same address within the hour is refused', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const target = `member-email-cooldown-${randomUUID().slice(0, 8)}@pipsplit.test`;

    await signInAs(page, users.cooldown);
    await members.goto();
    await expect(members.currentGroupName).toHaveText(groups.cooldown.name);

    await members.editMember(cooldownMember.key, { email: target });
    await expect(
      members.snackbarWith(
        `We sent a confirmation link to ${target}. Your group email will change once you confirm it.`
      )
    ).toBeVisible();

    // The same address again: refused by the per-recipient cooldown, with
    // the dialog left open.
    await members.clickMemberRow(cooldownMember.key);
    await members.fillEditMemberForm(undefined, target);
    await members.editMemberSaveButton.click();
    await expect(
      members.snackbarWith(
        'A confirmation email was sent to that address recently. Try again in an hour.'
      )
    ).toBeVisible();
    await members.waitForLoadingComplete();
    await expect(members.editMemberDialog).toBeVisible();
    await members.cancelEditMember();

    // Only the first request queued a mail.
    const mail = await getSeedAdmin()
      .db.collection('mail')
      .where('to', '==', target)
      .get();
    expect(mail.size).toBe(1);
  });
});
