import { randomUUID } from 'node:crypto';
// Plain Playwright, not ../fixtures: this spec needs no page or browser (the
// suite fixtures would load the login page in a worker for nothing).
import { test } from '@playwright/test';
import {
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore/lite';
import { EMAIL_RULES } from '../seed/datasets/email-rules';
import {
  expectAllowed,
  expectDenied as denied,
  withDb as withUserDb,
  type RulesUser,
} from '../utils/rules-client';

/**
 * firestore.rules' email guard, checked through the real web SDK against
 * the test emulators. A member's or user's `email` must be '' or exactly one
 * valid address when it is set (create) or changed (update); an unchanged
 * stored value, even an invalid or null one, does not block other writes.
 * The clients come from e2e/utils/rules-client.ts (the web SDK in the
 * Playwright worker; no page is opened).
 *
 * Each denial has a positive control on the same doc by the same user, so a
 * denial can only come from the email guard.
 */

const { admin, legacyUser, creator, group, target, legacyList, legacyNull } =
  EMAIL_RULES;

// The same table as src/app/utilities/email-validation.spec.ts and
// functions/src/email-formatting.spec.ts, so all three copies of the pattern
// (JS app, JS server, RE2 rules) are checked against the same rows.
const VALID = [
  'a+b@x.co.uk',
  'alice@example.com',
  'Alice.Smith@Example.COM',
  "o'brien@x.io",
  'first.last@sub-domain.example.org',
  'a@x1.co',
  'A@X.COM',
  'user@example.xn--p1ai',
  'user@xn--80ak6aa92e.com',
];
const INVALID = [
  'a@b',
  'a@x.com,b@y.com',
  'a@x.com;b',
  'a @x.com',
  'a@x.com<b>',
  '"a"@x.com',
  'a@b@x.com',
  '@x.com',
  '.a@x.com',
  'a..b@x.com',
  'a.@x.com',
  'a@x.c',
  'a@x.123',
  'a@-x.com',
  'a@x-.com',
  'a@x..com',
  'a@x.com\n',
  'Al <a@x.com>',
  'ü@x.com',
  'a@bücher.de',
  'a@x.xn--',
];

/** withUserDb with the arguments flipped, defaulting to Ezra. */
function withDb(
  run: (db: Firestore) => Promise<void>,
  user: RulesUser = admin
): Promise<void> {
  return withUserDb(user, run);
}

function expectDenied(write: Promise<unknown>, email: unknown): Promise<void> {
  return denied(write, `write of ${JSON.stringify(email)}`);
}

const userDoc = (db: Firestore, uid = admin.uid) => doc(db, 'users', uid);
const memberDoc = (db: Firestore, id: string) =>
  doc(db, 'groups', group.key, 'members', id);
const freshMember = (db: Firestore) => memberDoc(db, `m-${randomUUID()}`);

function newMember(email?: string) {
  return {
    displayName: `Rules ${randomUUID().slice(0, 8)}`,
    ...(email === undefined ? {} : { email }),
    userRef: null,
    active: true,
    groupAdmin: false,
  };
}

test.describe(
  'Firestore rules: single valid email',
  { tag: ['@members', '@account', '@auth'] },
  () => {
    test('a user can write one valid address to their own users doc', async () => {
      await withDb(async (db) => {
        for (const email of VALID) {
          await expectAllowed(updateDoc(userDoc(db), { email }));
        }
        // End on the seeded address.
        await expectAllowed(updateDoc(userDoc(db), { email: admin.email }));
      });
    });

    test('a user cannot write an invalid address to their users doc', async () => {
      await withDb(async (db) => {
        for (const email of [...INVALID, null]) {
          await expectDenied(updateDoc(userDoc(db), { email }), email);
        }
      });
    });

    test('a user cannot create their users doc with an invalid address', async () => {
      // Users may create only their own doc (B13), so the creates run as a
      // user who deletes their own doc first; the final valid create is the
      // positive control and leaves the doc in place, so this repeats fine.
      await withDb(async (db) => {
        const own = userDoc(db, creator.uid);
        await expectAllowed(deleteDoc(own));
        for (const email of [...INVALID, null]) {
          await expectDenied(setDoc(own, { email }), email);
        }
        await expectAllowed(setDoc(own, { email: creator.email }));
      }, creator);
    });

    test('an unrelated write to a users doc that stores an invalid email is allowed', async () => {
      await withDb(async (db) => {
        const own = userDoc(db, legacyUser.uid);
        await expectAllowed(
          updateDoc(own, { venmoId: `@rules-${randomUUID().slice(0, 8)}` })
        );
        // The setDoc-merge shape UserService.updateUser uses.
        await expectAllowed(
          setDoc(own, { paypalId: 'rules@pipsplit.test' }, { merge: true })
        );
        // Changing it is still checked.
        await expectDenied(updateDoc(own, { email: 'a@b' }), 'a@b');
      }, legacyUser);
    });

    test('a group admin can set a member email to empty or one valid address', async () => {
      await withDb(async (db) => {
        await expectAllowed(
          updateDoc(memberDoc(db, target.key), { email: '' })
        );
        for (const email of VALID) {
          await expectAllowed(updateDoc(memberDoc(db, target.key), { email }));
        }
        await expectAllowed(
          updateDoc(memberDoc(db, target.key), { email: target.email })
        );

        for (const email of VALID) {
          await expectAllowed(setDoc(freshMember(db), newMember(email)));
        }
        await expectAllowed(setDoc(freshMember(db), newMember('')));
        // A member doc with no email field at all.
        await expectAllowed(setDoc(freshMember(db), newMember()));
      });
    });

    test('a group admin cannot create or update a member with an invalid address', async () => {
      await withDb(async (db) => {
        for (const email of [...INVALID, null]) {
          await expectDenied(
            setDoc(freshMember(db), newMember(email as string)),
            email
          );
          await expectDenied(
            updateDoc(memberDoc(db, target.key), { email }),
            email
          );
        }
      });
    });

    test('a member with a stored comma-list email: unrelated updates pass, changes are checked', async () => {
      await withDb(async (db) => {
        const ref = memberDoc(db, legacyList.key);
        await expectAllowed(
          updateDoc(ref, { displayName: 'Legacy List Renamed' })
        );
        await expectAllowed(updateDoc(ref, { active: false }));
        await expectDenied(updateDoc(ref, { email: 'a@b' }), 'a@b');
        await expectDenied(updateDoc(ref, { email: null }), null);
        // One-shot per seeding: once fixed, the stored value is valid.
        await expectAllowed(
          updateDoc(ref, { email: 'email-rules-list-fixed@pipsplit.test' })
        );
        await expectAllowed(updateDoc(ref, { email: '' }));
      });
    });

    test('a member with a stored null email: unrelated updates pass, changes are checked', async () => {
      await withDb(async (db) => {
        const ref = memberDoc(db, legacyNull.key);
        await expectAllowed(
          updateDoc(ref, { displayName: 'Legacy Null Renamed' })
        );
        // null -> null is not a change.
        await expectAllowed(updateDoc(ref, { email: null, active: false }));
        await expectDenied(
          updateDoc(ref, { email: 'a@x.com,b@y.com' }),
          'a list'
        );
        // One-shot per seeding: once set, the stored value is no longer null.
        await expectAllowed(
          updateDoc(ref, { email: 'email-rules-null-fixed@pipsplit.test' })
        );
        await expectAllowed(updateDoc(ref, { email: '' }));
      });
    });

    test('an address over 254 characters is refused', async () => {
      const domain = '@pipsplit.test';
      const atLimit = 'a'.repeat(254 - domain.length) + domain;
      await withDb(async (db) => {
        await expectDenied(
          setDoc(freshMember(db), newMember('a' + atLimit)),
          '255 chars'
        );
        await expectAllowed(setDoc(freshMember(db), newMember(atLimit)));
      });
    });
  }
);
