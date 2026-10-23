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
  type Firestore,
} from 'firebase/firestore/lite';
import { getSeedAdmin } from '../seed/admin';
import { SHARED } from '../seed/datasets/shared';
import { USERS_READ_RULES } from '../seed/datasets/users-read-rules';
import { notDenied, withDb, withUsers } from '../utils/rules-client';

/**
 * Who may read `users/{uid}` (firestore.rules, Phase 3 read half), checked
 * through the real web SDK on the test emulators: only the owner and the app
 * admin may get a users doc, and no client may query the collection (payment
 * handles reach a payer through the getMemberPaymentMethods callable, and
 * invited members link on the server). The verified-address index
 * (verifiedEmails) and the payment-lookup counters (paymentLookupLimits) are
 * server-only, the owner of an entry included.
 *
 * Only two denials are new: a get of another user's doc and any query of
 * `users` (the old rule let any signed-in user do both). The index and the
 * counters were already default-denied; their tests pin that. The denial
 * tests end with a positive control that a permitted read still works (the
 * owner's get of the same doc, the same caller's own doc, or the admin's get).
 */

const { users, group } = USERS_READ_RULES;

const userDoc = (db: Firestore, uid: string) => doc(db, 'users', uid);

/** A get that resolves to whether the doc exists (so expect can await it). */
const exists = async (db: Firestore, uid: string) =>
  (await getDoc(userDoc(db, uid))).exists();

test.describe(
  'Firestore rules: users docs are read only by their owner and the admin',
  { tag: ['@account', '@auth', '@members', '@groups', '@summary'] },
  () => {
    test('a user reads their own doc; the app admin reads any', async () => {
      await withUsers(
        [users.target, SHARED.users.admin],
        async ([targetDb, adminDb]) => {
          const own = (
            await getDoc(userDoc(targetDb!, users.target.uid))
          ).data();
          expect(own).toMatchObject({
            email: users.target.email,
            venmoId: users.target.profile!.venmoId,
          });
          expect(
            (await getDoc(userDoc(adminDb!, users.target.uid))).data()?.[
              'venmoId'
            ]
          ).toBe(users.target.profile!.venmoId);
        }
      );
    });

    test('a user can read their own doc before it exists', async () => {
      // waitForServerCreatedUser listens to the caller's own doc while
      // createUserProfileOnSignUp has yet to write it, so the get rule must
      // not depend on resource.data.
      const { db: adminDb } = getSeedAdmin();
      const ref = adminDb.doc(`users/${users.fresh.uid}`);
      const original = (await ref.get()).data();
      expect(original).toBeDefined();
      try {
        await withDb(users.fresh, async (db) => {
          await deleteDoc(userDoc(db, users.fresh.uid));
          expect(await exists(db, users.fresh.uid)).toBe(false);
        });
      } finally {
        await ref.set(original!);
      }
    });

    test("a user cannot read another user's doc, even a fellow member's", async () => {
      await withUsers(
        [users.reader, users.target],
        async ([readerDb, targetDb]) => {
          const through = await notDenied([
            // The reader is the admin of the target's group.
            [
              'a fellow member’s doc',
              () => getDoc(userDoc(readerDb!, users.target.uid)),
            ],
            [
              'a doc that does not exist',
              () => getDoc(userDoc(readerDb!, `u-urr-missing-${randomUUID()}`)),
            ],
          ]);
          expect(through).toEqual([]);
          // Positive control: the owner reads the same doc.
          expect(await exists(targetDb!, users.target.uid)).toBe(true);
        }
      );
    });

    test('no client may query users, not even the admin or for its own doc', async () => {
      await withUsers(
        [users.reader, SHARED.users.admin],
        async ([readerDb, adminDb]) => {
          const queries = (db: Firestore) => {
            const groupRef = doc(db, 'groups', group.key);
            return [
              // member.service's old invite auto-link lookup.
              [
                'by emailLower',
                () =>
                  getDocs(
                    query(
                      collection(db, 'users'),
                      where('emailLower', '==', users.target.email)
                    )
                  ),
              ],
              [
                'by its own emailLower',
                () =>
                  getDocs(
                    query(
                      collection(db, 'users'),
                      where('emailLower', '==', users.reader.email)
                    )
                  ),
              ],
              // group.service updateGroup's old default-group clear.
              [
                'by defaultGroupRef',
                () =>
                  getDocs(
                    query(
                      collection(db, 'users'),
                      where('defaultGroupRef', '==', groupRef)
                    )
                  ),
              ],
              ['the whole collection', () => getDocs(collection(db, 'users'))],
            ] as [string, () => Promise<unknown>][];
          };
          const through = await notDenied([
            ...queries(readerDb!).map(
              ([label, run]) => [`reader: ${label}`, run] as const
            ),
            ...queries(adminDb!).map(
              ([label, run]) => [`admin: ${label}`, run] as const
            ),
          ] as [string, () => Promise<unknown>][]);
          expect(through).toEqual([]);
          // Positive control: the same caller gets its own doc.
          expect(await exists(readerDb!, users.reader.uid)).toBe(true);
        }
      );
    });

    test('the verified-address index and payment-lookup counters are server-only', async () => {
      // The entry the sign-up trigger writes for a verified login address
      // (verified-emails.ts upsertVerifiedEmail), and a counter in the shape
      // call-allowance.ts writes, both owned by the caller.
      const { db: adminDb } = getSeedAdmin();
      await adminDb.doc(`verifiedEmails/${users.reader.email}`).set({
        uid: users.reader.uid,
        email: users.reader.email,
        verifiedAt: new Date(),
        source: 'login',
      });
      await adminDb.doc(`paymentLookupLimits/${users.reader.uid}`).set({
        windowStart: new Date(),
        count: 0,
      });
      await withDb(users.reader, async (db) => {
        const ownEntry = doc(db, 'verifiedEmails', users.reader.email);
        const otherEntry = doc(db, 'verifiedEmails', users.target.email);
        const unclaimed = `urr-claim-${randomUUID().slice(0, 8)}@pipsplit.test`;
        const ownLimit = doc(db, 'paymentLookupLimits', users.reader.uid);
        const otherLimit = doc(db, 'paymentLookupLimits', users.target.uid);
        const through = await notDenied([
          ['read own index entry', () => getDoc(ownEntry)],
          ['read another user’s index entry', () => getDoc(otherEntry)],
          [
            'query the index by uid',
            () =>
              getDocs(
                query(
                  collection(db, 'verifiedEmails'),
                  where('uid', '==', users.reader.uid)
                )
              ),
          ],
          // Claiming an address would link its pending invites to the caller.
          [
            'claim an unclaimed address',
            () =>
              setDoc(doc(db, 'verifiedEmails', unclaimed), {
                uid: users.reader.uid,
                email: unclaimed,
                source: 'login',
              }),
          ],
          [
            'take over another user’s address',
            () => updateDoc(otherEntry, { uid: users.reader.uid }),
          ],
          [
            'update own index entry',
            () => updateDoc(ownEntry, { source: 'backfill' }),
          ],
          ['delete own index entry', () => deleteDoc(ownEntry)],
          ['read own lookup counter', () => getDoc(ownLimit)],
          [
            'query the lookup counters',
            () => getDocs(collection(db, 'paymentLookupLimits')),
          ],
          ['reset own lookup counter', () => setDoc(ownLimit, { count: 0 })],
          ['zero own lookup counter', () => updateDoc(ownLimit, { count: 0 })],
          ['delete own lookup counter', () => deleteDoc(ownLimit)],
          [
            'create another user’s counter',
            () => setDoc(otherLimit, { count: 100 }),
          ],
        ]);
        expect(through).toEqual([]);
        // Positive control: the same caller reads its own users doc.
        expect(await exists(db, users.reader.uid)).toBe(true);
      });
    });

    test('the admin cannot reach the index or the counters either', async () => {
      await withDb(SHARED.users.admin, async (db) => {
        const through = await notDenied([
          [
            'read an index entry',
            () => getDoc(doc(db, 'verifiedEmails', users.reader.email)),
          ],
          ['query the index', () => getDocs(collection(db, 'verifiedEmails'))],
          [
            'write an index entry',
            () =>
              setDoc(
                doc(
                  db,
                  'verifiedEmails',
                  `urr-admin-${randomUUID().slice(0, 8)}@pipsplit.test`
                ),
                { uid: SHARED.users.admin.uid }
              ),
          ],
          [
            'read a counter',
            () => getDoc(doc(db, 'paymentLookupLimits', users.reader.uid)),
          ],
        ]);
        expect(through).toEqual([]);
        // Positive control: the admin's users read exception still holds.
        expect(await exists(db, users.reader.uid)).toBe(true);
      });
    });
  }
);
