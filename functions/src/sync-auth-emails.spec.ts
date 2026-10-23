import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_UID_EMU } from './common';
// index.ts initialises the Admin SDK and exports the callable.
import { syncAuthEmailsToUsers } from './index';
import { uniqueId } from './test-fixtures';

// The callable walks the whole users collection, so other specs' users are
// processed too. This spec seeds its own users, runs the sync once, and then
// asserts only on those users (never on the totals in the result).

const db = getFirestore();

function call(auth: { uid: string } | null) {
  return Promise.resolve(
    syncAuthEmailsToUsers.run({
      auth: auth ? { ...auth, token: {} } : undefined,
      data: {},
    } as any)
  );
}

describe('syncAuthEmailsToUsers: guards', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(call(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses a signed-in user who is not the admin', async () => {
    await expect(call({ uid: uniqueId('u') })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

describe('syncAuthEmailsToUsers: the admin', () => {
  const synced = { uid: uniqueId('synced'), email: '' };
  const noEmail = { uid: uniqueId('noemail') };
  const unverified = { uid: uniqueId('unverified'), email: '' };
  const noAccount = { uid: uniqueId('noaccount') };
  let result: { synced: number; skipped: number; errors: string[] };

  const emailOf = async (uid: string) =>
    (await db.collection('users').doc(uid).get()).data()?.['email'];

  beforeAll(async () => {
    synced.email = `${synced.uid}@sync-emails.test`;
    unverified.email = `${unverified.uid}@sync-emails.test`;

    await getAuth().createUser({
      uid: synced.uid,
      email: synced.email,
      emailVerified: true,
    });
    await getAuth().createUser({ uid: noEmail.uid });
    await getAuth().createUser({
      uid: unverified.uid,
      email: unverified.email,
      emailVerified: false,
    });

    await db.collection('users').doc(synced.uid).set({ email: 'stale@old.test' });
    await db.collection('users').doc(noEmail.uid).set({ email: 'keep@old.test' });
    await db
      .collection('users')
      .doc(unverified.uid)
      .set({ email: 'keep-too@old.test' });
    await db.collection('users').doc(noAccount.uid).set({ email: 'x@old.test' });

    result = await call({ uid: ADMIN_UID_EMU });
  });

  it('copies the Auth email onto the user doc', async () => {
    expect(await emailOf(synced.uid)).toBe(synced.email);
    expect(result.synced).toBeGreaterThanOrEqual(1);
  });

  it('skips an Auth user that has no email', async () => {
    expect(await emailOf(noEmail.uid)).toBe('keep@old.test');
  });

  it('skips an Auth user whose email is not verified', async () => {
    expect(await emailOf(unverified.uid)).toBe('keep-too@old.test');
    expect(result.skipped).toBeGreaterThanOrEqual(2);
  });

  it('lists a user doc with no Auth account in errors and leaves it alone', async () => {
    expect(result.errors.some((e) => e.startsWith(`${noAccount.uid}:`))).toBe(
      true
    );
    expect(await emailOf(noAccount.uid)).toBe('x@old.test');
  });

  it('does not report the users it handled as errors', async () => {
    for (const { uid } of [synced, noEmail, unverified]) {
      expect(result.errors.some((e) => e.startsWith(`${uid}:`))).toBe(false);
    }
  });
});
