import { randomUUID } from 'node:crypto';
// Plain Playwright, not ../fixtures: this spec needs no page or browser.
import { expect, test } from '@playwright/test';
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore/lite';
import { getSeedAdmin } from '../seed/admin';
import { MEMBER_RULES } from '../seed/datasets/member-rules';
import type { SeedMember, SeedUser } from '../seed/types';
import {
  expectAllowed,
  expectDenied,
  notDenied,
  withDb,
} from '../utils/rules-client';

/**
 * Who may write `groups/{gid}/members/{mid}` (firestore.rules), checked
 * through the real web SDK on the test emulators. A group admin may write
 * any member. A member may write their own doc only in the shapes the app's
 * self-service paths use (memberSelfUpdateValid): never granting themselves
 * groupAdmin (syncGroupMemberUids would copy it into adminUids, a full
 * admin), never changing userRef, and reactivating only by rejoining after
 * leaving voluntarily.
 *
 * Every denial below got through the old self clause (`userRef == caller`,
 * any field). Each has a positive control on the same doc by the same user.
 */

const { users, members, group } = MEMBER_RULES;

const memberDoc = (db: Firestore, member: SeedMember) =>
  doc(db, 'groups', group.key, 'members', member.key);
const userRef = (db: Firestore, user: SeedUser) => doc(db, 'users', user.uid);

/** Puts a member doc back in its seeded state (Admin SDK, bypasses rules). */
async function resetMember(member: SeedMember, user: SeedUser): Promise<void> {
  const { db } = getSeedAdmin();
  await db.doc(`groups/${group.key}/members/${member.key}`).set({
    userRef: db.doc(`users/${user.uid}`),
    displayName: member.displayName,
    email: member.email,
    emailLower: member.email!.toLowerCase(),
    active: member.active ?? true,
    groupAdmin: member.groupAdmin ?? false,
    ...(member.leftGroup ? { leftGroup: true } : {}),
  });
}

async function readMember(member: SeedMember) {
  const { db } = getSeedAdmin();
  return (
    await db.doc(`groups/${group.key}/members/${member.key}`).get()
  ).data();
}

test.describe(
  'Firestore rules: members write only their own doc, and never grant admin',
  { tag: ['@members', '@groups', '@account'] },
  () => {
    test('a plain member cannot make themselves admin or change their own userRef', async () => {
      await resetMember(members.promoter, users.promoter);
      await withDb(users.promoter, async (db) => {
        const own = memberDoc(db, members.promoter);
        const through = await notDenied([
          ['groupAdmin true', () => updateDoc(own, { groupAdmin: true })],
          [
            'groupAdmin true with a rename',
            () => updateDoc(own, { groupAdmin: true, displayName: 'Boss' }),
          ],
          [
            'groupAdmin true via setDoc merge',
            () => setDoc(own, { groupAdmin: true }, { merge: true }),
          ],
          [
            'userRef to another user',
            () => updateDoc(own, { userRef: userRef(db, users.admin) }),
          ],
          ['userRef to null', () => updateDoc(own, { userRef: null })],
          [
            'emailLower',
            () => updateDoc(own, { emailLower: 'someone@pipsplit.test' }),
          ],
          [
            'invite',
            () => updateDoc(own, { invite: { sendCount: 0 } }),
          ],
        ]);
        expect(through).toEqual([]);

        // Positive controls: edit-member's Save on one's own row (it sends
        // active and groupAdmin unchanged), then back to the seeded name.
        await expectAllowed(
          updateDoc(own, {
            displayName: `Promoter ${randomUUID().slice(0, 8)}`,
            email: users.promoter.email,
            active: true,
            groupAdmin: false,
          })
        );
        await expectAllowed(
          updateDoc(own, { displayName: members.promoter.displayName })
        );
      });
      expect(await readMember(members.promoter)).toMatchObject({
        groupAdmin: false,
        displayName: members.promoter.displayName,
      });
    });

    test('a group admin can promote and demote a member', async () => {
      await resetMember(members.promotee, users.promotee);
      await withDb(users.admin, async (db) => {
        const target = memberDoc(db, members.promotee);
        // edit-member's Save with the Group Admin toggle switched on.
        await expectAllowed(
          updateDoc(target, {
            displayName: members.promotee.displayName,
            email: users.promotee.email,
            active: true,
            groupAdmin: true,
          })
        );
        expect((await readMember(members.promotee))?.['groupAdmin']).toBe(true);
        await expectAllowed(updateDoc(target, { groupAdmin: false }));
      });
      expect((await readMember(members.promotee))?.['groupAdmin']).toBe(false);
    });

    test('a member can leave (the update leaveGroup makes) and rejoin', async () => {
      await resetMember(members.leaver, users.leaver);
      await withDb(users.leaver, async (db) => {
        const own = memberDoc(db, members.leaver);
        await expectAllowed(
          updateDoc(own, { active: false, leftGroup: true, groupAdmin: false }),
          'leave'
        );
        expect(await readMember(members.leaver)).toMatchObject({
          active: false,
          leftGroup: true,
          groupAdmin: false,
        });
        // rejoinGroup().
        await expectAllowed(
          updateDoc(own, { leftGroup: false, active: true }),
          'rejoin'
        );
      });
      expect(await readMember(members.leaver)).toMatchObject({
        active: true,
        leftGroup: false,
      });
    });

    test('a member with no splits can leave by deleting their own doc', async () => {
      await resetMember(members.deleter, users.deleter);
      await withDb(users.deleter, async (db) => {
        await expectAllowed(deleteDoc(memberDoc(db, members.deleter)));
      });
      expect(await readMember(members.deleter)).toBeUndefined();
      // Not recreatable by the member: create is admin-only. The admin puts
      // it back (the seeded state is restored by the next run's reset).
      await withDb(users.deleter, async (db) => {
        await expectDenied(
          setDoc(memberDoc(db, members.deleter), {
            userRef: userRef(db, users.deleter),
            displayName: members.deleter.displayName,
            email: users.deleter.email,
            active: true,
            groupAdmin: false,
          })
        );
      });
      await withDb(users.admin, async (db) => {
        await expectAllowed(
          setDoc(memberDoc(db, members.deleter), {
            userRef: userRef(db, users.deleter),
            displayName: members.deleter.displayName,
            email: users.deleter.email,
            active: true,
            groupAdmin: false,
          })
        );
      });
    });

    test('a member can change their own member email (Account > Profile sync)', async () => {
      await resetMember(members.emailer, users.emailer);
      await withDb(users.emailer, async (db) => {
        // updateAllMemberEmails(): every member doc linked to the user.
        const linked = await getDocs(
          query(
            collectionGroup(db, 'members'),
            where('userRef', '==', userRef(db, users.emailer))
          )
        );
        expect(linked.docs.map((d) => d.id)).toEqual([members.emailer.key]);
        const other = `member-rules-emailer-${randomUUID().slice(0, 8)}@pipsplit.test`;
        for (const email of [other, users.emailer.email]) {
          await expectAllowed(updateDoc(linked.docs[0]!.ref, { email }), email);
        }
        // B12's format guard still applies to a self-write.
        await expectDenied(updateDoc(linked.docs[0]!.ref, { email: 'a@b' }));
      });
      expect((await readMember(members.emailer))?.['email']).toBe(
        users.emailer.email
      );
    });

    test('a member an admin deactivated cannot reactivate themselves', async () => {
      await resetMember(members.deactivated, users.deactivated);
      await withDb(users.deactivated, async (db) => {
        const own = memberDoc(db, members.deactivated);
        const through = await notDenied([
          ['active true', () => updateDoc(own, { active: true })],
          [
            'rejoin shape',
            () => updateDoc(own, { leftGroup: false, active: true }),
          ],
          // "Leave" while inactive, to be allowed to "rejoin" next.
          [
            'leave while inactive',
            () =>
              updateDoc(own, {
                active: false,
                leftGroup: true,
                groupAdmin: false,
              }),
          ],
          ['leftGroup true alone', () => updateDoc(own, { leftGroup: true })],
          ['groupAdmin true', () => updateDoc(own, { groupAdmin: true })],
        ]);
        expect(through).toEqual([]);

        // Positive control: the self clause still covers an inactive member.
        await expectAllowed(
          updateDoc(own, {
            displayName: `Deactivated ${randomUUID().slice(0, 8)}`,
          })
        );
      });
      expect(await readMember(members.deactivated)).toMatchObject({
        active: false,
        groupAdmin: false,
      });
      expect(await readMember(members.deactivated)).not.toHaveProperty(
        'leftGroup'
      );
    });

    test('a member who left can rejoin, but not as an admin', async () => {
      await resetMember(members.left, users.left);
      await withDb(users.left, async (db) => {
        const own = memberDoc(db, members.left);
        const through = await notDenied([
          [
            'rejoin as admin',
            () =>
              updateDoc(own, {
                leftGroup: false,
                active: true,
                groupAdmin: true,
              }),
          ],
          ['groupAdmin true', () => updateDoc(own, { groupAdmin: true })],
        ]);
        expect(through).toEqual([]);

        await expectAllowed(
          updateDoc(own, { leftGroup: false, active: true }),
          'rejoin'
        );
        // Leaving again (as leaveGroup does) restores the seeded state.
        await expectAllowed(
          updateDoc(own, { active: false, leftGroup: true, groupAdmin: false }),
          'leave again'
        );
      });
      expect(await readMember(members.left)).toMatchObject({
        active: false,
        leftGroup: true,
        groupAdmin: false,
      });
    });

    test('a member cannot write another member of their group', async () => {
      // Denials only, on the admin's own doc, which no test writes.
      await withDb(users.promoter, async (db) => {
        const through = await notDenied([
          [
            'rename another member',
            () =>
              updateDoc(memberDoc(db, members.admin), {
                displayName: 'Hijacked',
              }),
          ],
          [
            'demote another member',
            () =>
              updateDoc(memberDoc(db, members.admin), { groupAdmin: false }),
          ],
          [
            'delete another member',
            () => deleteDoc(memberDoc(db, members.admin)),
          ],
        ]);
        expect(through).toEqual([]);
      });
    });
  }
);
