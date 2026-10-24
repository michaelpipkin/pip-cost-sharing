import { randomUUID } from 'node:crypto';
// Plain Playwright, not ../fixtures: this spec needs no page or browser.
import { expect, test } from '@playwright/test';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore/lite';
import { USER_RULES } from '../seed/datasets/user-rules';
import {
  expectAllowed,
  expectDenied,
  notDenied,
  withDb,
  withUsers,
} from '../utils/rules-client';

/**
 * Who may write `users/{uid}` (firestore.rules), checked through the real
 * web SDK on the test emulators (clients from e2e/utils/rules-client.ts):
 * only the owner. A group admin used to be allowed to clear another user's
 * defaultGroupRef that pointed at the admin's group (group.service
 * updateGroup, member.service removeMemberFromGroup); those clears now run
 * in the syncGroupMemberUids and clearDefaultsOnGroupDeactivate triggers
 * (Admin SDK), and the exception is gone. Reads are checked by
 * users-read-rules.spec.ts.
 *
 * Every denial is an attack that the old rule (any signed-in user may write
 * any users doc) allowed. Each has a positive control: the same write by the
 * owner, or the allowed form of the write by the same caller, so a denial can
 * only come from the ownership rule.
 */

const {
  admin,
  member,
  own,
  creator,
  batchAdmin,
  batchVictim,
  singleVictim,
  profileVictim,
} = USER_RULES.users;
const { groupA, groupBatch } = USER_RULES.groups;

const userDoc = (db: Firestore, uid: string) => doc(db, 'users', uid);
const groupDoc = (db: Firestore, key: string) => doc(db, 'groups', key);

/** The owner reads their own default (no one else may read the doc). */
async function defaultGroupId(
  ownerDb: Firestore,
  uid: string
): Promise<string | null> {
  const snap = await getDoc(userDoc(ownerDb, uid));
  return snap.data()?.['defaultGroupRef']?.id ?? null;
}

/** The owner points their own default back at `groupKey` (an own write). */
async function resetDefault(
  ownerDb: Firestore,
  uid: string,
  groupKey: string
): Promise<void> {
  await expectAllowed(
    updateDoc(userDoc(ownerDb, uid), {
      defaultGroupRef: groupDoc(ownerDb, groupKey),
    }),
    `reset ${uid}'s default`
  );
}

test.describe(
  'Firestore rules: users docs are written by their owner',
  { tag: ['@groups', '@members', '@account'] },
  () => {
    test('a user can update their own payment IDs, emailOptOut and default group', async () => {
      await withDb(own, async (db) => {
        const ref = userDoc(db, own.uid);
        const handle = `@ur-${randomUUID().slice(0, 8)}`;
        await expectAllowed(
          updateDoc(ref, {
            venmoId: handle,
            paypalId: `${handle.slice(1)}@pipsplit.test`,
            cashAppId: `$${handle.slice(1)}`,
            zelleId: `${handle.slice(1)}@pipsplit.test`,
          })
        );
        // The setDoc-merge shape UserService.updateUser uses.
        await expectAllowed(
          setDoc(ref, { emailOptOut: true }, { merge: true })
        );
        await expectAllowed(
          setDoc(ref, { emailOptOut: false }, { merge: true })
        );
        await expectAllowed(updateDoc(ref, { defaultGroupRef: null }));
        await expectAllowed(
          updateDoc(ref, { defaultGroupRef: groupDoc(db, groupA.key) })
        );
        expect((await getDoc(ref)).data()?.['venmoId']).toBe(handle);
      });
    });

    test('a user can delete and create their own doc', async () => {
      await withDb(creator, async (db) => {
        const ref = userDoc(db, creator.uid);
        await expectAllowed(deleteDoc(ref));
        await expectAllowed(
          setDoc(ref, {
            email: creator.email,
            defaultGroupRef: null,
            receiptPolicy: false,
            emailOptOut: false,
            venmoId: '',
            paypalId: '',
            cashAppId: '',
            zelleId: '',
          })
        );
        expect((await getDoc(ref)).data()?.['email']).toBe(creator.email);
      });
    });

    test("a group admin's deactivate/archive batch cannot clear another user's default", async () => {
      // The batch group.service updateGroup() used to write: the group
      // update, the admin's own clear and the other user's clear.
      await withUsers(
        [batchAdmin, batchVictim],
        async ([adminDb, victimDb]) => {
          const groupRef = groupDoc(adminDb!, groupBatch.key);
          // Reactivate and repoint both defaults, so the test repeats.
          await expectAllowed(
            updateDoc(groupRef, { active: true, archived: false })
          );
          await resetDefault(adminDb!, batchAdmin.uid, groupBatch.key);
          await resetDefault(victimDb!, batchVictim.uid, groupBatch.key);

          for (const changes of [
            { active: false },
            { archived: true, active: false },
          ]) {
            const batch = writeBatch(adminDb!);
            batch.update(groupRef, changes);
            batch.update(userDoc(adminDb!, batchAdmin.uid), {
              defaultGroupRef: null,
            });
            batch.update(userDoc(adminDb!, batchVictim.uid), {
              defaultGroupRef: null,
            });
            await expectDenied(batch.commit(), JSON.stringify(changes));
          }
          // The denied batches were atomic: nothing in them landed.
          expect(await defaultGroupId(victimDb!, batchVictim.uid)).toBe(
            groupBatch.key
          );
          expect(await defaultGroupId(adminDb!, batchAdmin.uid)).toBe(
            groupBatch.key
          );
          expect((await getDoc(groupRef)).data()?.['active']).toBe(true);

          // Positive control: the same batch without the other user's clear
          // (updateGroup now writes the group update, then the admin's own
          // default; the trigger clears everyone else's).
          const batch = writeBatch(adminDb!);
          batch.update(groupRef, { archived: true, active: false });
          batch.update(userDoc(adminDb!, batchAdmin.uid), {
            defaultGroupRef: null,
          });
          await expectAllowed(batch.commit(), 'without the cross-user clear');
          expect((await getDoc(groupRef)).data()?.['active']).toBe(false);
        }
      );
    });

    test("a group admin cannot clear another user's default that points at their group", async () => {
      // A single update, as member.service removeMemberFromGroup() used to
      // write it (syncGroupMemberUids clears a removed member's default now).
      await withUsers([admin, singleVictim], async ([adminDb, victimDb]) => {
        await resetDefault(victimDb!, singleVictim.uid, groupA.key);
        await expectDenied(
          updateDoc(userDoc(adminDb!, singleVictim.uid), {
            defaultGroupRef: null,
          })
        );
        expect(await defaultGroupId(victimDb!, singleVictim.uid)).toBe(
          groupA.key
        );
        // Positive control: the owner may clear it.
        await expectAllowed(
          updateDoc(userDoc(victimDb!, singleVictim.uid), {
            defaultGroupRef: null,
          })
        );
        await resetDefault(victimDb!, singleVictim.uid, groupA.key);
      });
    });

    test("another user cannot change a user's payment IDs, emailOptOut or email, or delete the doc", async () => {
      await withUsers(
        [member, admin, profileVictim],
        async ([memberDb, adminDb, victimDb]) => {
          const attacks: [string, (db: Firestore) => Promise<void>][] = [
            [
              'venmoId (update)',
              (db) =>
                updateDoc(userDoc(db, profileVictim.uid), {
                  venmoId: '@ur-attacker',
                }),
            ],
            [
              'venmoId (set merge)',
              (db) =>
                setDoc(
                  userDoc(db, profileVictim.uid),
                  { venmoId: '@ur-attacker' },
                  { merge: true }
                ),
            ],
            [
              'paypalId',
              (db) =>
                updateDoc(userDoc(db, profileVictim.uid), {
                  paypalId: 'user-rules-member@pipsplit.test',
                }),
            ],
            [
              'cashAppId',
              (db) =>
                updateDoc(userDoc(db, profileVictim.uid), {
                  cashAppId: '$ur-attacker',
                }),
            ],
            [
              'zelleId',
              (db) =>
                updateDoc(userDoc(db, profileVictim.uid), {
                  zelleId: 'user-rules-member@pipsplit.test',
                }),
            ],
            [
              'emailOptOut',
              (db) =>
                updateDoc(userDoc(db, profileVictim.uid), {
                  emailOptOut: true,
                }),
            ],
            [
              'email',
              (db) =>
                updateDoc(userDoc(db, profileVictim.uid), {
                  email: 'user-rules-member@pipsplit.test',
                }),
            ],
            ['delete', (db) => deleteDoc(userDoc(db, profileVictim.uid))],
          ];
          // A plain member and a group admin of the victim's group alike.
          expect(
            await notDenied(
              attacks.flatMap(([label, attack]) => [
                [`member: ${label}`, () => attack(memberDb!)],
                [`admin: ${label}`, () => attack(adminDb!)],
              ])
            )
          ).toEqual([]);
          const stored = (
            await getDoc(userDoc(victimDb!, profileVictim.uid))
          ).data();
          expect(stored).toMatchObject({
            venmoId: profileVictim.profile!.venmoId,
            paypalId: profileVictim.profile!.paypalId,
            emailOptOut: false,
            email: profileVictim.email,
          });

          // Positive control: the owner may make each of these writes (ending
          // on the seeded values; the delete is covered by the creator test).
          const ownRef = userDoc(victimDb!, profileVictim.uid);
          await expectAllowed(
            updateDoc(ownRef, { venmoId: '@ur-attacker', emailOptOut: true })
          );
          // A profile may store only its own verified address (B14), so the
          // owner's email change is to the same address in other casing.
          await expectAllowed(
            updateDoc(ownRef, { email: profileVictim.email.toUpperCase() })
          );
          await expectAllowed(
            updateDoc(ownRef, {
              venmoId: profileVictim.profile!.venmoId,
              emailOptOut: false,
              email: profileVictim.email,
            })
          );
        }
      );
    });

    test('a user cannot create a doc for a different uid', async () => {
      await withDb(member, async (db) => {
        const body = {
          email: `user-rules-${randomUUID().slice(0, 8)}@pipsplit.test`,
          venmoId: '@ur-attacker',
        };
        // A uid with no doc yet (overwriting an existing doc is an update,
        // covered by the payment-ID test).
        await expectDenied(
          setDoc(userDoc(db, `u-user-rules-${randomUUID()}`), body)
        );
        // Positive control: creating one's own doc is allowed (the creator test).
      });
    });
  }
);
