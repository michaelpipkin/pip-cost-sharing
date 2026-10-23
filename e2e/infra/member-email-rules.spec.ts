import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Plain Playwright, not ../fixtures: this spec needs no page or browser.
import { expect, test } from '@playwright/test';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore/lite';
import { getSeedAdmin } from '../seed/admin';
import { MEMBER_EMAIL_RULES } from '../seed/datasets/member-email-rules';
import type { SeedMember, SeedUser } from '../seed/types';
import {
  expectAllowed,
  expectDenied,
  notDenied,
  withDb,
  withSession,
} from '../utils/rules-client';

/**
 * Plan 4 B19: a linked member's `email` is always an address the linked
 * user has proven they own, so group mail can go to `member.email`
 * (firestore.rules, groups/{gid}/members/{mid}). Checked through the real
 * web SDK on the test emulators:
 * - create: a doc with userRef set must carry that user's profile email
 *   (users/{uid}.email, compared case-insensitively, never empty). The I2
 *   attack (an admin linking a victim's userRef to an address of their
 *   choosing) is denied. The creator's own row (addGroup) may also carry ''
 *   or their verified sign-in address.
 * - userRef: an admin may set it from null (with the same email match) or
 *   clear it; X to Y is denied; a member never touches it.
 * - email on a linked doc: no client, the member or an admin. Changes go
 *   through the requestMemberEmailChange / updateMemberEmails callables
 *   (Admin SDK).
 * - email on an unlinked doc: admins, as before (edit-member's
 *   updateMemberWithUserMatching, which may link in the same write).
 * - emailLower, when a client writes it, must equal email lowercased.
 * - the callable's token, rate-limit and recipient-cooldown collections,
 *   and the group-mail callables' per-caller limits, are server-only.
 * Every denial has a positive control on the same doc by the same user.
 */

const { users, members, group } = MEMBER_EMAIL_RULES;

const memberDoc = (db: Firestore, id: string) =>
  doc(db, 'groups', group.key, 'members', id);
const userRef = (db: Firestore, user: SeedUser) => doc(db, 'users', user.uid);
const randomEmail = (label: string) =>
  `mer-${label}-${randomUUID().slice(0, 8)}@pipsplit.test`;

/** Puts a seeded member doc back in its seeded state (Admin SDK). */
async function resetMember(member: SeedMember): Promise<void> {
  const { db } = getSeedAdmin();
  const linkedUser = Object.values(users).find((u) => u.key === member.userKey);
  await db.doc(`groups/${group.key}/members/${member.key}`).set({
    userRef: linkedUser ? db.doc(`users/${linkedUser.uid}`) : null,
    displayName: member.displayName,
    email: member.email,
    emailLower: (member.email ?? '').toLowerCase(),
    active: true,
    groupAdmin: member.groupAdmin ?? false,
  });
}

async function readMember(id: string): Promise<DocumentData | undefined> {
  const { db } = getSeedAdmin();
  return (await db.doc(`groups/${group.key}/members/${id}`).get()).data();
}

/** A new member doc's fields, as add-member writes them. */
function newMember(fields: DocumentData): DocumentData {
  return {
    displayName: `New ${randomUUID().slice(0, 8)}`,
    active: true,
    groupAdmin: false,
    ...fields,
  };
}

test.describe(
  'Firestore rules: a linked member email is always one its user owns',
  { tag: ['@members', '@groups', '@account'] },
  () => {
    test('an admin creates a linked member only with the linked user’s profile email (I2)', async () => {
      await withDb(users.admin, async (db) => {
        const fresh = () => memberDoc(db, `m-mer-new-${randomUUID()}`);
        const through = await notDenied([
          // I2: a victim's userRef with an address the admin chose.
          [
            'victim userRef with an arbitrary email',
            () =>
              setDoc(
                fresh(),
                newMember({
                  userRef: userRef(db, users.victim),
                  email: randomEmail('attacker'),
                })
              ),
          ],
          [
            'victim userRef with no email',
            () =>
              setDoc(
                fresh(),
                newMember({ userRef: userRef(db, users.victim), email: '' })
              ),
          ],
          [
            'victim userRef with the email field left out',
            () =>
              setDoc(
                fresh(),
                newMember({ userRef: userRef(db, users.victim) })
              ),
          ],
          [
            'userRef to a user doc that does not exist',
            () =>
              setDoc(
                fresh(),
                newMember({
                  userRef: doc(db, 'users', `u-missing-${randomUUID()}`),
                  email: randomEmail('missing'),
                })
              ),
          ],
          // A doc outside users/ that also holds an `email` field.
          [
            'userRef to a member doc',
            () =>
              setDoc(
                fresh(),
                newMember({
                  userRef: memberDoc(db, members.target.key),
                  email: users.target.email,
                })
              ),
          ],
          [
            'unlinked with an inconsistent emailLower',
            () =>
              setDoc(
                fresh(),
                newMember({
                  userRef: null,
                  email: randomEmail('lower'),
                  emailLower: users.victim.email,
                })
              ),
          ],
          // The creator's own-row allowance is for the caller only.
          [
            'victim userRef with the admin’s own address',
            () =>
              setDoc(
                fresh(),
                newMember({
                  userRef: userRef(db, users.victim),
                  email: users.admin.email,
                })
              ),
          ],
        ]);
        expect(through).toEqual([]);

        // Positive controls: add-member's create, unlinked and auto-linked
        // by the profile email (any casing), and a consistent emailLower.
        const unlinkedEmail = randomEmail('unlinked');
        await expectAllowed(
          setDoc(fresh(), newMember({ userRef: null, email: unlinkedEmail })),
          'unlinked'
        );
        await expectAllowed(
          setDoc(
            fresh(),
            newMember({
              userRef: null,
              email: unlinkedEmail.toUpperCase(),
              emailLower: unlinkedEmail,
            })
          ),
          'unlinked with emailLower'
        );
        // Links only the dedicated runtime linkee (never victim), so the
        // allowed create changes no other user's documented state.
        await expectAllowed(
          setDoc(
            fresh(),
            newMember({
              userRef: userRef(db, users.runtimeLinkee),
              email: users.runtimeLinkee.email.toUpperCase(),
            })
          ),
          'linked by the profile email'
        );
      });
    });

    test('a new group’s creator may add their own row (addGroup)', async () => {
      await withDb(users.admin, async (db) => {
        // group.service addGroup: the group doc first, then the member and
        // the Default category in one batch.
        const createGroup = async () => {
          const groupRef = doc(collection(db, 'groups'));
          await setDoc(groupRef, {
            name: `Member Email Rules – Created ${randomUUID().slice(0, 8)}`,
            active: true,
            archived: false,
            autoAddMembers: false,
            currencyCode: 'USD',
            currencySymbol: '$',
            decimalPlaces: 2,
            memberUids: [users.admin.uid],
            activeMemberUids: [users.admin.uid],
            adminUids: [users.admin.uid],
          });
          return groupRef;
        };
        const addOwnRow = async (email: string) => {
          const groupRef = await createGroup();
          const batch = writeBatch(db);
          batch.set(
            doc(collection(db, `groups/${groupRef.id}/members`)),
            newMember({
              userRef: userRef(db, users.admin),
              email,
              groupAdmin: true,
            })
          );
          batch.set(doc(collection(db, `groups/${groupRef.id}/categories`)), {
            name: 'Default',
            active: true,
          });
          return batch.commit();
        };
        await expectAllowed(addOwnRow(users.admin.email), 'profile email');
        // A legacy profile email that fails the single-address rule makes
        // add-group store '' instead.
        await expectAllowed(addOwnRow(''), 'blank');
        await expectDenied(
          addOwnRow(randomEmail('creator')),
          'another address'
        );
      });
    });

    test('an admin changes an unlinked member’s email, and links it only by the profile email', async () => {
      await resetMember(members.unlinkedEdit);
      await resetMember(members.unlinkedLink);
      await withDb(users.admin, async (db) => {
        const edit = memberDoc(db, members.unlinkedEdit.key);
        const link = memberDoc(db, members.unlinkedLink.key);
        const through = await notDenied([
          // updateMemberWithUserMatching links when the typed address is a
          // registered user's; any other address with that userRef is I2.
          [
            'link with a different email',
            () =>
              updateDoc(link, {
                email: randomEmail('link'),
                userRef: userRef(db, users.linkable),
              }),
          ],
          [
            'link without changing the (blank) email',
            () => updateDoc(link, { userRef: userRef(db, users.linkable) }),
          ],
          [
            'inconsistent emailLower',
            () =>
              updateDoc(edit, {
                email: randomEmail('edit'),
                emailLower: users.victim.email,
              }),
          ],
        ]);
        expect(through).toEqual([]);

        // edit-member's Save on an unlinked row: every field, email changed.
        await expectAllowed(
          updateDoc(edit, {
            displayName: members.unlinkedEdit.displayName,
            email: randomEmail('edit'),
            active: true,
            groupAdmin: false,
          }),
          'unlinked email change'
        );
        await expectAllowed(
          updateDoc(edit, { email: members.unlinkedEdit.email }),
          'back to the seeded email'
        );
        // ...and the auto-link to the registered user with that address.
        await expectAllowed(
          updateDoc(link, {
            displayName: members.unlinkedLink.displayName,
            email: users.linkable.email,
            active: true,
            groupAdmin: false,
            userRef: userRef(db, users.linkable),
          }),
          'link by the profile email'
        );
      });
      expect(
        (await readMember(members.unlinkedLink.key))?.['userRef']?.id
      ).toBe(users.linkable.uid);
      await resetMember(members.unlinkedLink);
    });

    test('userRef: an admin may clear it but never move it; a member never touches it', async () => {
      await resetMember(members.unlinkee);
      await resetMember(members.self);
      await withDb(users.admin, async (db) => {
        const own = memberDoc(db, members.unlinkee.key);
        const through = await notDenied([
          [
            'X to Y, with Y’s profile email',
            () =>
              updateDoc(own, {
                userRef: userRef(db, users.linkable),
                email: users.linkable.email,
              }),
          ],
          [
            'X to Y, userRef only',
            () => updateDoc(own, { userRef: userRef(db, users.linkable) }),
          ],
          [
            'clear it and change the email',
            () => updateDoc(own, { userRef: null, email: randomEmail('x') }),
          ],
        ]);
        expect(through).toEqual([]);
        await expectAllowed(updateDoc(own, { userRef: null }), 'X to null');
      });
      expect((await readMember(members.unlinkee.key))?.['userRef']).toBeNull();
      await resetMember(members.unlinkee);

      await withDb(users.self, async (db) => {
        const own = memberDoc(db, members.self.key);
        const through = await notDenied([
          ['own userRef to null', () => updateDoc(own, { userRef: null })],
          [
            'own userRef to another user',
            () => updateDoc(own, { userRef: userRef(db, users.victim) }),
          ],
        ]);
        expect(through).toEqual([]);
      });
    });

    // M1/M2 (2026-10-23): no client changes a linked member's email, not
    // even the member to their own verified address. Account > Profile's
    // Sync and the group email update dialog go through the
    // updateMemberEmails callable, which checks for duplicates and cancels
    // pending confirmation links; edit-member's own-row change through
    // requestMemberEmailChange.
    test('a linked member’s email: no client may change it, the member or an admin', async () => {
      await resetMember(members.target);
      await resetMember(members.admin);
      await withSession(users.admin, async (db, auth) => {
        // A fresh token, so the verified address is in its claims: the
        // denials below can only come from the linked-email rule.
        await auth.currentUser!.getIdToken(true);
        const target = memberDoc(db, members.target.key);
        const ownRow = memberDoc(db, members.admin.key);
        const through = await notDenied([
          [
            'admin changes a linked member’s email',
            () => updateDoc(target, { email: randomEmail('admin-set') }),
          ],
          [
            'admin sets a linked member’s email to its user’s address, recased',
            () =>
              updateDoc(target, { email: users.target.email.toUpperCase() }),
          ],
          [
            'admin changes their own linked email to another address',
            () => updateDoc(ownRow, { email: randomEmail('admin-own') }),
          ],
          [
            'admin sets their own linked email to their verified address, recased',
            () => updateDoc(ownRow, { email: users.admin.email.toUpperCase() }),
          ],
        ]);
        expect(through).toEqual([]);

        // Positive control: edit-member's Save by an admin on a linked row
        // (email sent unchanged).
        await expectAllowed(
          updateDoc(target, {
            displayName: `Target ${randomUUID().slice(0, 8)}`,
            email: users.target.email,
            active: true,
            groupAdmin: false,
          }),
          'admin save with the email unchanged'
        );
      });

      await withSession(users.target, async (db, auth) => {
        const { claims } = await auth.currentUser!.getIdTokenResult(true);
        expect(claims['email_verified']).toBe(true);
        const own = memberDoc(db, members.target.key);
        const through = await notDenied([
          [
            'self to their verified address, recased (the former Profile Sync)',
            () => updateDoc(own, { email: users.target.email.toUpperCase() }),
          ],
          [
            'self to another address',
            () => updateDoc(own, { email: randomEmail('self-other') }),
          ],
          [
            'self to another user’s address',
            () => updateDoc(own, { email: users.victim.email }),
          ],
          // linkInvitedMembers links by emailLower.
          [
            'self points emailLower at another address',
            () => updateDoc(own, { emailLower: users.victim.email }),
          ],
        ]);
        expect(through).toEqual([]);

        // Positive control: edit-member's self-save of displayName (email
        // sent unchanged).
        await expectAllowed(
          updateDoc(own, {
            displayName: members.target.displayName,
            email: users.target.email,
            active: true,
            groupAdmin: false,
          }),
          'self-save of displayName'
        );
      });
      expect(await readMember(members.target.key)).toMatchObject({
        email: users.target.email,
        displayName: members.target.displayName,
      });
      expect(await readMember(members.admin.key)).toMatchObject({
        email: members.admin.email,
      });
    });

    test('an unverified sign-in address is never a provable one', async () => {
      await resetMember(members.unverified);
      await withSession(users.unverified, async (db, auth) => {
        expect(auth.currentUser?.emailVerified).toBe(false);
        const own = memberDoc(db, members.unverified.key);
        await expectDenied(
          updateDoc(own, { email: users.unverified.email.toUpperCase() }),
          'own unverified address'
        );
        // (Every linked-email change is denied now; this stays as a guard
        // should a self-write branch ever return.)
        await expectAllowed(
          updateDoc(own, { displayName: members.unverified.displayName }),
          'unrelated self-write'
        );
      });
    });

    test('the email-change tokens and rate limits are server-only', async () => {
      const { db: adminDb } = getSeedAdmin();
      const tokenId = `t-${randomUUID()}`;
      await adminDb.doc(`memberEmailChangeTokens/${tokenId}`).set({
        uid: users.self.uid,
      });
      await adminDb.doc(`memberEmailChangeLimits/${users.self.uid}`).set({
        count: 0,
      });
      await withDb(users.self, async (db) => {
        const token = doc(db, 'memberEmailChangeTokens', tokenId);
        const limit = doc(db, 'memberEmailChangeLimits', users.self.uid);
        const through = await notDenied([
          ['read own token', () => getDoc(token)],
          ['write a token', () => setDoc(token, { uid: users.self.uid })],
          ['delete a token', () => deleteDoc(token)],
          ['read own rate limit', () => getDoc(limit)],
          ['reset own rate limit', () => setDoc(limit, { count: 0 })],
        ]);
        expect(through).toEqual([]);
      });
    });

    // The access tests below pass on Firestore's default deny
    // alone, so they can't notice a server-only block being deleted (and
    // later shadowed by a broad allow). This pins the explicit denies in
    // the rules source, and that no catch-all match exists.
    test('the rules declare every server-only collection explicitly', () => {
      const rules = readFileSync(
        fileURLToPath(new URL('../../firestore.rules', import.meta.url)),
        'utf8'
      );
      const missing = [
        'memberEmailChangeTokens/{tokenId}',
        'memberEmailChangeLimits/{uid}',
        'memberEmailRecipientCooldown/{addressHash}',
        'groupMailLimits/{uid}',
      ].filter((path) => {
        const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        return !new RegExp(
          `match /${escaped} \\{\\s*allow read, write: if false;\\s*\\}`
        ).test(rules);
      });
      expect(missing).toEqual([]);
      expect(rules).not.toMatch(/match \/\{document=\*\*\}/);
    });

    test('the recipient cooldowns and group-mail limits are server-only', async () => {
      const { db: adminDb } = getSeedAdmin();
      const hash = createHash('sha256')
        .update(randomEmail('cooldown'))
        .digest('hex');
      await adminDb.doc(`memberEmailRecipientCooldown/${hash}`).set({
        expiresAt: new Date(Date.now() + 60_000),
      });
      await adminDb.doc(`groupMailLimits/${users.self.uid}`).set({
        hours: {},
      });
      await withDb(users.self, async (db) => {
        const cooldown = doc(db, 'memberEmailRecipientCooldown', hash);
        const limit = doc(db, 'groupMailLimits', users.self.uid);
        const newCooldown = doc(
          db,
          'memberEmailRecipientCooldown',
          `c-${randomUUID()}`
        );
        // Positive control: the same user can still read their own profile.
        expect((await getDoc(userRef(db, users.self))).exists()).toBe(true);
        const through = await notDenied([
          ['read a cooldown', () => getDoc(cooldown)],
          ['clear a cooldown', () => deleteDoc(cooldown)],
          ['write a cooldown', () => setDoc(newCooldown, { expiresAt: 0 })],
          ['read own group-mail limit', () => getDoc(limit)],
          ['reset own group-mail limit', () => setDoc(limit, { hours: {} })],
          ['delete own group-mail limit', () => deleteDoc(limit)],
        ]);
        expect(through).toEqual([]);
      });
    });
  }
);
