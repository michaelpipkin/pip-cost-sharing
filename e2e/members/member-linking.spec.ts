import { randomUUID } from 'node:crypto';
import type { Locator } from '@playwright/test';
import { verifiedEmailId } from '../../functions/src/email-identity';
import { expect, test } from '../fixtures';
import { MembersPage } from '../pages/members.page';
import { getSeedAdmin } from '../seed/admin';
import { MEMBER_LINKING } from '../seed/datasets/member-linking';
import type { SeedUser } from '../seed/types';
import { signInAs } from '../utils/session';

// Invited members are linked to their accounts on the server, through the
// verified-address index (verifiedEmails), when an admin adds a row or edits
// its email (the syncMemberEmailLower trigger). Each test signs in as the
// group's admin and claims the address of its own seeded account (see
// e2e/seed/datasets/member-linking.ts). The index and the member docs are
// read through the Admin SDK on the test emulator, with generous
// condition-based timeouts: the sign-up trigger that indexes a seeded
// account's login address and the member trigger are cold-function work.

const { users, group, editRow, twinRow } = MEMBER_LINKING;

/** Sign-up trigger or member trigger on cold functions. */
const TRIGGER_TIMEOUT_MS = 90_000;

const db = () => getSeedAdmin().db;
const indexEntry = (address: string) =>
  db().doc(`verifiedEmails/${verifiedEmailId(address)}`);

/** Waits for the sign-up trigger to have indexed the user's login address. */
async function expectLoginIndexed(user: SeedUser): Promise<void> {
  await expect
    .poll(async () => (await indexEntry(user.email).get()).get('uid') ?? null, {
      message: `no verified-address entry for ${user.email}`,
      timeout: TRIGGER_TIMEOUT_MS,
    })
    .toBe(user.uid);
}

/**
 * Indexes another address as proven by `user`, the way a confirmed group email
 * does. Unique to the run, so the address is never claimed twice.
 */
async function indexSecondAddress(user: SeedUser): Promise<string> {
  const address = `${user.key}-alt-${randomUUID().slice(0, 8)}@pipsplit.test`;
  await indexEntry(address).set({
    uid: user.uid,
    email: address,
    verifiedAt: new Date(),
    source: 'group-confirm',
  });
  return address;
}

/** The uid a member row is linked to ('' while unlinked). */
async function linkedUid(memberId: string): Promise<string> {
  const snap = await db()
    .doc(`groups/${group.key}/members/${memberId}`)
    .get();
  return snap.get('userRef')?.id ?? '';
}

/** The id of the one member row with this (run-unique) display name. */
async function memberIdByName(displayName: string): Promise<string> {
  const snap = await db()
    .collection(`groups/${group.key}/members`)
    .where('displayName', '==', displayName)
    .get();
  expect(snap.size).toBe(1);
  return snap.docs[0].id;
}

/** Waits for the trigger to link the row to `user`. */
async function expectLinkedTo(memberId: string, user: SeedUser): Promise<void> {
  await expect
    .poll(() => linkedUid(memberId), {
      message: `member ${memberId} was not linked to ${user.uid}`,
      timeout: TRIGGER_TIMEOUT_MS,
    })
    .toBe(user.uid);
}

/** A row's envelope: shown only for an unlinked, active member with an email. */
function inviteButtonOf(row: Locator): Locator {
  return row.locator('[data-testid^="invite-member-button-"]');
}

const runSuffix = () => randomUUID().slice(0, 6);

test.describe('Member linking', { tag: ['@members'] }, () => {
  test('should link a member added by a registered user’s login address', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const name = `Login ${runSuffix()}`;
    await expectLoginIndexed(users.login);

    await signInAs(page, users.admin);
    await members.goto();
    // Other casing: the index is keyed by the lowercased address.
    await members.addMember(name, users.login.email.toUpperCase());

    const memberId = await memberIdByName(name);
    await expectLinkedTo(memberId, users.login);
    // The members page follows the link: no invite envelope on a linked row.
    const row = members.row(memberId);
    await expect(row).toBeVisible();
    await expect(inviteButtonOf(row)).toHaveCount(0);
  });

  test('should link a member added by a second address the user has proven', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const name = `Second ${runSuffix()}`;
    const secondAddress = await indexSecondAddress(users.secondary);

    await signInAs(page, users.admin);
    await members.goto();
    await members.addMember(name, secondAddress);

    const memberId = await memberIdByName(name);
    await expectLinkedTo(memberId, users.secondary);
    await expect(inviteButtonOf(members.row(memberId))).toHaveCount(0);
  });

  test('should link an unlinked member whose email is edited to an owned address', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    await expectLoginIndexed(users.editee);

    await signInAs(page, users.admin);
    await members.goto();
    const row = members.row(editRow.key);
    await expect(row.getByTestId('member-name-cell')).toHaveText(
      editRow.displayName
    );
    expect(await linkedUid(editRow.key)).toBe('');

    await members.editMember(editRow.key, { email: users.editee.email });
    await expect(row.getByTestId('member-email-cell')).toHaveText(
      users.editee.email
    );

    await expectLinkedTo(editRow.key, users.editee);
    await expect(inviteButtonOf(row)).toHaveCount(0);
  });

  test('should leave a second row for the same person unlinked', async ({
    page,
  }) => {
    const members = new MembersPage(page);
    const dupName = `Twin Alt ${runSuffix()}`;
    const altAddress = await indexSecondAddress(users.twin);
    // The seeded row is the twin's one row in the group.
    expect(await linkedUid(twinRow.key)).toBe(users.twin.uid);

    await signInAs(page, users.admin);
    await members.goto();
    await members.addMember(dupName, altAddress);

    const dupId = await memberIdByName(dupName);
    // The client never writes emailLower, and syncMemberEmailLower writes it
    // after its link attempt when it did not link, so the value appearing
    // proves the trigger ran and left the row unlinked (a negative cannot be
    // awaited otherwise).
    const dupDoc = db().doc(`groups/${group.key}/members/${dupId}`);
    await expect
      .poll(async () => (await dupDoc.get()).get('emailLower') ?? '', {
        message: `syncMemberEmailLower never ran for ${dupId}`,
        timeout: TRIGGER_TIMEOUT_MS,
      })
      .toBe(altAddress.toLowerCase());
    expect(await linkedUid(dupId)).toBe('');
    await expect(inviteButtonOf(members.row(dupId))).toBeVisible();
    // And the person's own row is still the linked one.
    expect(await linkedUid(twinRow.key)).toBe(users.twin.uid);
  });
});
