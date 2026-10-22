import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore/lite';
// Imported from config.mjs directly, never from e2e/constants (which is
// profile-aware): this spec must only ever reach the isolated test emulators.
import {
  TEST_PORTS,
  TEST_PROJECT_ID,
} from '../../scripts/test-env/config.mjs';
import { expect, test } from '../fixtures';
import { EMAIL_RULES } from '../seed/datasets/email-rules';

/**
 * firestore.rules' email guard (isValidEmailOrEmpty), checked through the
 * real client SDK against the test emulators: a member's or user's `email`
 * must be '' or exactly one valid address. There is no
 * @firebase/rules-unit-testing here, so this runs in the Playwright worker
 * (Node) with the web SDK; it never opens a page.
 *
 * Signed in as EMAIL_RULES.admin (group admin of its own group), so a denial
 * can only come from the email check: the same user's valid writes to the
 * same docs are allowed.
 */

const { admin, group, target } = EMAIL_RULES;
// The brief's examples plus two dot-atom cases, so the RE2 copy is checked
// against the same table as the app and server copies.
const INVALID = [
  'a@b',
  'a@x.com,b@y.com',
  'a@x.com;b',
  'a @x.com',
  'a@x.com<b>',
  '"a"@x.com',
  'a..b@x.com',
  'a@x.123',
];

if (!TEST_PROJECT_ID.startsWith('demo-')) {
  throw new Error(`email-rules.spec only runs on a demo- project, not ${TEST_PROJECT_ID}`);
}

/** A client app signed in as the dataset's admin, on the test emulators. */
async function signedInDb(): Promise<{ app: FirebaseApp; db: Firestore }> {
  const app = initializeApp(
    { apiKey: 'demo-api-key', projectId: TEST_PROJECT_ID },
    `email-rules-${randomUUID()}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${TEST_PORTS.auth}`, {
    disableWarnings: true,
  });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', TEST_PORTS.firestore);
  await signInWithEmailAndPassword(auth, admin.email, admin.password);
  return { app, db };
}

async function withDb(run: (db: Firestore) => Promise<void>): Promise<void> {
  const { app, db } = await signedInDb();
  try {
    await run(db);
  } finally {
    await deleteApp(app);
  }
}

async function expectDenied(write: Promise<unknown>): Promise<void> {
  await expect(write).rejects.toMatchObject({ code: 'permission-denied' });
}

const userDoc = (db: Firestore) => doc(db, 'users', admin.uid);
const memberDoc = (db: Firestore, id: string) =>
  doc(db, 'groups', group.key, 'members', id);

function newMember(email: string) {
  return {
    displayName: `Rules ${randomUUID().slice(0, 8)}`,
    email,
    userRef: null,
    active: true,
    groupAdmin: false,
  };
}

test.describe('Firestore rules: single valid email', { tag: ['@members', '@account'] }, () => {
  test('a user can write one valid address to their own users doc', async () => {
    await withDb(async (db) => {
      const plus = admin.email.replace('@', '+rules@');
      await updateDoc(userDoc(db), { email: plus });
      // End on the seeded address.
      await updateDoc(userDoc(db), { email: admin.email });
    });
  });

  test('a user cannot write an invalid address to a users doc', async () => {
    await withDb(async (db) => {
      for (const email of INVALID) {
        await expectDenied(updateDoc(userDoc(db), { email }));
        // A create (an unused id) is guarded the same way.
        await expectDenied(
          setDoc(doc(db, 'users', `u-email-rules-${randomUUID()}`), { email })
        );
      }
    });
  });

  test('a group admin can set a member email to empty or one valid address', async () => {
    await withDb(async (db) => {
      await updateDoc(memberDoc(db, target.key), { email: '' });
      await updateDoc(memberDoc(db, target.key), { email: target.email });

      // Plus-addressing and a multi-label domain (like a+b@x.co.uk).
      await setDoc(
        memberDoc(db, `m-${randomUUID()}`),
        newMember(`rules+${randomUUID()}@sub.pipsplit.test`)
      );
      await setDoc(memberDoc(db, `m-${randomUUID()}`), newMember(''));
    });
  });

  test('a group admin cannot create or update a member with an invalid address', async () => {
    await withDb(async (db) => {
      for (const email of INVALID) {
        await expectDenied(
          setDoc(memberDoc(db, `m-${randomUUID()}`), newMember(email))
        );
        await expectDenied(updateDoc(memberDoc(db, target.key), { email }));
      }
    });
  });

  test('an address over 254 characters is refused', async () => {
    const domain = '@pipsplit.test';
    const atLimit = 'a'.repeat(254 - domain.length) + domain;
    await withDb(async (db) => {
      await expectDenied(
        setDoc(memberDoc(db, `m-${randomUUID()}`), newMember('a' + atLimit))
      );
      await setDoc(memberDoc(db, `m-${randomUUID()}`), newMember(atLimit));
    });
  });
});
