import { randomUUID } from 'node:crypto';
// Plain Playwright, not ../fixtures: this spec needs no page or browser.
import { expect, test } from '@playwright/test';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
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
 * only the owner, except that a group admin may set defaultGroupRef to null
 * on a doc whose default is the admin's group (and change nothing else).
 *
 * Every denial is an attack that the old rule (any signed-in user may write
 * any users doc) allowed. Each has a positive control: the same write by the
 * owner, or the allowed form of the write by the same caller, so a denial can
 * only come from the ownership rule.
 */

const {
  admin,
  member,
  adminB,
  own,
  creator,
  batchAdmin,
  batchVictim,
  singleVictim,
  profileVictim,
  memberVictim,
  setVictim,
  comboVictim,
  bVictim,
} = USER_RULES.users;
const { groupA, groupB, groupSecond, groupBatch } = USER_RULES.groups;

const userDoc = (db: Firestore, uid: string) => doc(db, 'users', uid);
const groupDoc = (db: Firestore, key: string) => doc(db, 'groups', key);

async function defaultGroupId(
  db: Firestore,
  uid: string
): Promise<string | null> {
  const snap = await getDoc(userDoc(db, uid));
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

/**
 * group.service.ts updateGroup() for a deactivate or archive, through the
 * client SDK: one writeBatch with the group update and a defaultGroupRef
 * clear on every user whose default is the group.
 */
async function deactivateInBatch(
  db: Firestore,
  groupKey: string,
  changes: Record<string, unknown>
): Promise<string[]> {
  const groupRef = groupDoc(db, groupKey);
  const batch = writeBatch(db);
  batch.update(groupRef, changes);
  const users = await getDocs(
    query(collection(db, 'users'), where('defaultGroupRef', '==', groupRef))
  );
  users.forEach((u) => batch.update(u.ref, { defaultGroupRef: null }));
  await expectAllowed(batch.commit(), `batch ${JSON.stringify(changes)}`);
  return users.docs.map((u) => u.id).sort();
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

    test("a group admin's deactivate/archive batch clears other users' defaults", async () => {
      await withUsers(
        [batchAdmin, batchVictim],
        async ([adminDb, victimDb]) => {
          const expected = [batchAdmin.uid, batchVictim.uid].sort();
          for (const changes of [
            { active: false },
            { archived: true, active: false },
          ]) {
            // Reactivate and repoint both defaults, so the test repeats.
            await expectAllowed(
              updateDoc(groupDoc(adminDb!, groupBatch.key), {
                active: true,
                archived: false,
              })
            );
            await resetDefault(adminDb!, batchAdmin.uid, groupBatch.key);
            await resetDefault(victimDb!, batchVictim.uid, groupBatch.key);

            // The batch holds the group update, the admin's own clear and the
            // cross-user clear; the rule's get() of the group must still find
            // the admin in adminUids.
            expect(
              await deactivateInBatch(adminDb!, groupBatch.key, changes)
            ).toEqual(expected);
            expect(await defaultGroupId(adminDb!, batchVictim.uid)).toBeNull();
            expect(await defaultGroupId(adminDb!, batchAdmin.uid)).toBeNull();
            const group = (
              await getDoc(groupDoc(adminDb!, groupBatch.key))
            ).data();
            expect(group?.['active']).toBe(false);
          }
        }
      );
    });

    test("a group admin can clear another user's default that points at their group", async () => {
      // A single update, as member.service removeMemberFromGroup() writes it.
      await withUsers([admin, singleVictim], async ([adminDb, victimDb]) => {
        await resetDefault(victimDb!, singleVictim.uid, groupA.key);
        await expectAllowed(
          updateDoc(userDoc(adminDb!, singleVictim.uid), {
            defaultGroupRef: null,
          })
        );
        expect(await defaultGroupId(adminDb!, singleVictim.uid)).toBeNull();
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

    test("a plain member cannot clear another user's default group", async () => {
      await withUsers(
        [member, admin, memberVictim],
        async ([memberDb, adminDb, victimDb]) => {
          await resetDefault(victimDb!, memberVictim.uid, groupA.key);
          await expectDenied(
            updateDoc(userDoc(memberDb!, memberVictim.uid), {
              defaultGroupRef: null,
            })
          );
          const batch = writeBatch(memberDb!);
          batch.update(userDoc(memberDb!, memberVictim.uid), {
            defaultGroupRef: null,
          });
          await expectDenied(batch.commit(), 'in a batch');
          expect(await defaultGroupId(victimDb!, memberVictim.uid)).toBe(
            groupA.key
          );
          // Positive control: the group's admin may.
          await expectAllowed(
            updateDoc(userDoc(adminDb!, memberVictim.uid), {
              defaultGroupRef: null,
            })
          );
          await resetDefault(victimDb!, memberVictim.uid, groupA.key);
        }
      );
    });

    test('an admin of one group cannot clear a default that points at another group', async () => {
      // user-rules-admin is admin of A but only a plain member of B.
      await withUsers(
        [admin, adminB, bVictim],
        async ([adminDb, adminBDb, victimDb]) => {
          await resetDefault(victimDb!, bVictim.uid, groupB.key);
          await expectDenied(
            updateDoc(userDoc(adminDb!, bVictim.uid), { defaultGroupRef: null })
          );
          expect(await defaultGroupId(victimDb!, bVictim.uid)).toBe(groupB.key);
          // Positive control: B's admin may.
          await expectAllowed(
            updateDoc(userDoc(adminBDb!, bVictim.uid), {
              defaultGroupRef: null,
            })
          );
          await resetDefault(victimDb!, bVictim.uid, groupB.key);
        }
      );
    });

    test("a group admin cannot point another user's default at a group", async () => {
      // user-rules-admin is admin of both A (the victim's default) and Second.
      await withUsers([admin, setVictim], async ([adminDb, victimDb]) => {
        await resetDefault(victimDb!, setVictim.uid, groupA.key);
        await expectDenied(
          updateDoc(userDoc(adminDb!, setVictim.uid), {
            defaultGroupRef: groupDoc(adminDb!, groupSecond.key),
          }),
          'to Second'
        );
        expect(await defaultGroupId(victimDb!, setVictim.uid)).toBe(groupA.key);
        // A doc whose default is already null cannot be pointed at a group
        // either (there is no current group to be admin of).
        await expectAllowed(
          updateDoc(userDoc(victimDb!, setVictim.uid), {
            defaultGroupRef: null,
          })
        );
        await expectDenied(
          updateDoc(userDoc(adminDb!, setVictim.uid), {
            defaultGroupRef: groupDoc(adminDb!, groupA.key),
          }),
          'from null to A'
        );
        // Positive control: the owner may.
        await expectAllowed(
          updateDoc(userDoc(victimDb!, setVictim.uid), {
            defaultGroupRef: groupDoc(victimDb!, groupSecond.key),
          })
        );
        await resetDefault(victimDb!, setVictim.uid, groupA.key);
      });
    });

    test("a group admin cannot clear another user's default together with another field", async () => {
      await withUsers([admin, comboVictim], async ([adminDb, victimDb]) => {
        await resetDefault(victimDb!, comboVictim.uid, groupA.key);
        const ref = userDoc(adminDb!, comboVictim.uid);
        const extras = [
          { venmoId: '@ur-attacker' },
          { emailOptOut: true },
          { email: 'user-rules-admin@pipsplit.test' },
          { receiptPolicy: true },
        ];
        expect(
          await notDenied(
            extras.map((extra) => [
              JSON.stringify(extra),
              () => updateDoc(ref, { defaultGroupRef: null, ...extra }),
            ])
          )
        ).toEqual([]);
        expect(await defaultGroupId(victimDb!, comboVictim.uid)).toBe(
          groupA.key
        );
        // Positive control: the clear on its own is allowed.
        await expectAllowed(updateDoc(ref, { defaultGroupRef: null }));
        await resetDefault(victimDb!, comboVictim.uid, groupA.key);
      });
    });
  }
);
