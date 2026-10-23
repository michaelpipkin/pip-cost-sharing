import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// index.ts initialises the Admin SDK and exports the callable.
import { deleteUserAccount } from './index';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';
import { addressesOf, ownerOf, upsertVerifiedEmail } from './verified-emails';

// The callable scans every group for the caller's membership, so each test
// uses its own uid and asserts only on the documents it created.

const db = getFirestore();

function call(uid: string | null) {
  return Promise.resolve(
    deleteUserAccount.run({
      auth: uid ? { uid, token: {} } : undefined,
      data: {},
    } as any)
  );
}

/** An Auth account plus (optionally) its users/{uid} profile. */
async function makeUser(opts: { profile?: boolean } = {}) {
  const uid = uniqueId('u');
  const email = `${uid}@delete-account.test`;
  await getAuth().createUser({ uid, email, emailVerified: true });
  const userRef = db.collection('users').doc(uid);
  if (opts.profile !== false) await userRef.set({ email });
  return { uid, email, userRef };
}

async function authUserExists(uid: string): Promise<boolean> {
  try {
    await getAuth().getUser(uid);
    return true;
  } catch {
    return false;
  }
}

describe('deleteUserAccount', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(call(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('deletes the user doc and the Auth user', async () => {
    const { uid, userRef } = await makeUser();

    await expect(call(uid)).resolves.toEqual({
      success: true,
      message: 'Account successfully deleted',
    });

    expect((await userRef.get()).exists).toBe(false);
    expect(await authUserExists(uid)).toBe(false);
  });

  it('removes every address the user had in the verified-address index', async () => {
    const { uid, email } = await makeUser();
    const secondary = `secondary-${uid}@delete-account.test`;
    await upsertVerifiedEmail(db, email, uid, 'login');
    await upsertVerifiedEmail(db, secondary, uid, 'group-confirm');
    expect(await addressesOf(db, uid)).toHaveLength(2);

    await call(uid);

    expect(await addressesOf(db, uid)).toEqual([]);
    expect(await ownerOf(db, secondary)).toBeNull();
  });

  it('keeps a shared group and its member, anonymised with no user link', async () => {
    const { uid, userRef } = await makeUser();
    const group = await makeGroup();
    // Another admin stays behind, so nobody needs promoting.
    const otherAdmin = await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('other')),
      groupAdmin: true,
    });
    const leaving = await makeMember(group, {
      userRef,
      displayName: 'Leaver',
      email: 'leaver@delete-account.test',
    });

    await call(uid);

    expect((await group.get()).exists).toBe(true);
    const kept = (await leaving.get()).data();
    expect(kept).toBeDefined();
    expect(kept?.['userRef']).toBeNull();
    expect(kept?.['displayName']).toBe('Leaver');
    expect(kept?.['email']).toBe('leaver@delete-account.test');
    // The other member is untouched.
    expect((await otherAdmin.get()).data()?.['userRef']).not.toBeNull();
  });

  it('deletes a group where the user is the only active member', async () => {
    const { uid, userRef } = await makeUser();
    const group = await makeGroup();
    const member = await makeMember(group, { userRef, groupAdmin: true });
    const expense = await group.collection('expenses').add({ amount: 10 });

    await call(uid);

    expect((await group.get()).exists).toBe(false);
    expect((await member.get()).exists).toBe(false);
    expect((await expense.get()).exists).toBe(false);
  });

  it('promotes the other members when the user is the only active admin', async () => {
    const { uid, userRef } = await makeUser();
    const group = await makeGroup();
    const leaving = await makeMember(group, { userRef, groupAdmin: true });
    const successor = await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('next')),
      groupAdmin: false,
    });

    await call(uid);

    expect((await successor.get()).data()?.['groupAdmin']).toBe(true);
    const gone = (await leaving.get()).data();
    expect(gone?.['groupAdmin']).toBe(false);
    expect(gone?.['userRef']).toBeNull();
  });

  it('still deletes the Auth user when the user doc is missing', async () => {
    const { uid, userRef } = await makeUser({ profile: false });
    expect((await userRef.get()).exists).toBe(false);

    await expect(call(uid)).resolves.toMatchObject({ success: true });

    expect(await authUserExists(uid)).toBe(false);
  });

  it('reports an internal error when the uid is not in Auth', async () => {
    const uid = uniqueId('ghost');
    await db.collection('users').doc(uid).set({ email: `${uid}@x.test` });

    await expect(call(uid)).rejects.toMatchObject({
      code: 'internal',
      message: expect.stringContaining('Error deleting account:'),
    });
  });

  // Regression for B2: with the departing sole admin inactive, the single
  // other active member used to be left unpromoted (no active admin).
  it('promotes the one other active member when the sole admin is inactive', async () => {
    const { uid, userRef } = await makeUser();
    const group = await makeGroup();
    await makeMember(group, { userRef, groupAdmin: true, active: false });
    const successor = await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('next')),
      groupAdmin: false,
    });

    await call(uid);

    expect((await successor.get()).data()?.['groupAdmin']).toBe(true);
  });

  // Final review M2 (B2 review minor): an inactive admin used to count as
  // "another admin", so the departing ACTIVE sole admin's group was left with
  // no active admin.
  it('promotes the other active members when the only other admin is inactive', async () => {
    const { uid, userRef } = await makeUser();
    const group = await makeGroup();
    const leaving = await makeMember(group, { userRef, groupAdmin: true });
    const inactiveAdmin = await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('old-admin')),
      groupAdmin: true,
      active: false,
    });
    const successor = await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('next')),
      groupAdmin: false,
    });

    await call(uid);

    expect((await successor.get()).data()?.['groupAdmin']).toBe(true);
    // Only active members are promoted; the inactive admin is left as is.
    expect((await inactiveAdmin.get()).data()).toMatchObject({
      groupAdmin: true,
      active: false,
    });
    expect((await leaving.get()).data()).toMatchObject({
      groupAdmin: false,
      userRef: null,
    });
  });

  it('does not promote anyone when another active admin remains', async () => {
    const { uid, userRef } = await makeUser();
    const group = await makeGroup();
    const leaving = await makeMember(group, { userRef, groupAdmin: true });
    await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('co-admin')),
      groupAdmin: true,
    });
    const member = await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('member')),
      groupAdmin: false,
    });

    await call(uid);

    expect((await member.get()).data()?.['groupAdmin']).toBe(false);
    // Anonymised, but keeps its admin flag (pre-existing behaviour).
    expect((await leaving.get()).data()?.['userRef']).toBeNull();
  });
});
