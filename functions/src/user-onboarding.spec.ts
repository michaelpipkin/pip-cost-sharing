import { randomUUID } from 'node:crypto';
import { getFirestore, Transaction } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profileEmail } from './common';
import { createUserProfileOnSignUp } from './index';

const db = getFirestore();

afterEach(() => vi.restoreAllMocks());

// The trigger is invoked directly (no Auth account is created), with a
// user record shaped like the one Auth hands it. Every test uses its own uid.
function signUp(user: { uid: string; email?: string; emailVerified: boolean }) {
  return Promise.resolve(createUserProfileOnSignUp.run(user as any, {} as any));
}

async function profile(uid: string) {
  return (await db.doc(`users/${uid}`).get()).data();
}

describe('createUserProfileOnSignUp', () => {
  it("gives an unverified sign-up an empty profile email, so invites can't link to it", async () => {
    const uid = `u-${randomUUID()}`;
    await signUp({ uid, email: `unverified-${uid}@example.com`, emailVerified: false });

    expect(await profile(uid)).toEqual({
      email: '',
      defaultGroupRef: null,
      receiptPolicy: false,
      emailOptOut: false,
      venmoId: '',
      paypalId: '',
      cashAppId: '',
      zelleId: '',
    });
  });

  it('gives a verified sign-up (e.g. Google) its email', async () => {
    const uid = `u-${randomUUID()}`;
    const email = `verified-${uid}@example.com`;
    await signUp({ uid, email, emailVerified: true });

    expect((await profile(uid))?.['email']).toBe(email);
  });

  it('only fills in missing fields, so a late run keeps the email verification wrote', async () => {
    const uid = `u-${randomUUID()}`;
    const email = `late-${uid}@example.com`;
    // The client (or verification) got there first.
    await db.doc(`users/${uid}`).set({ email, venmoId: '@kept' });

    await signUp({ uid, email, emailVerified: false });

    expect(await profile(uid)).toMatchObject({
      email,
      venmoId: '@kept',
      defaultGroupRef: null,
      emailOptOut: false,
    });
  });
});

describe('createUserProfileOnSignUp: defaults and re-runs', () => {
  const DEFAULTS = {
    email: '',
    defaultGroupRef: null,
    receiptPolicy: false,
    emailOptOut: false,
    venmoId: '',
    paypalId: '',
    cashAppId: '',
    zelleId: '',
  };

  it("writes exactly the 8 default fields, with email '' when the account has no email", async () => {
    const uid = `u-${randomUUID()}`;
    await signUp({ uid, emailVerified: false });

    const data = await profile(uid);
    expect(data).toEqual(DEFAULTS);
    expect(Object.keys(data!)).toHaveLength(8);
  });

  it("gives a verified account that has no email an empty email, not 'undefined'", async () => {
    const uid = `u-${randomUUID()}`;
    await signUp({ uid, emailVerified: true });

    expect((await profile(uid))?.['email']).toBe('');
  });

  // B8 (user-onboarding.ts:28-40, a blind overwrite on re-run) is already
  // fixed: the doc is filled in a transaction that writes only the fields it
  // lacks. Pinned as a passing test, not it.fails.
  it('keeps venmoId and receiptPolicy that a profile already has when it re-runs', async () => {
    const uid = `u-${randomUUID()}`;
    const email = `rerun-${uid}@example.com`;
    await db.doc(`users/${uid}`).set({ email, venmoId: 'v', receiptPolicy: true });

    await signUp({ uid, email, emailVerified: true });

    expect(await profile(uid)).toEqual({
      ...DEFAULTS,
      email,
      venmoId: 'v',
      receiptPolicy: true,
    });
  });

  it('is idempotent: a second run changes nothing and issues no write', async () => {
    const uid = `u-${randomUUID()}`;
    const user = { uid, email: `twice-${uid}@example.com`, emailVerified: true };
    const set = vi.spyOn(Transaction.prototype, 'set');
    await signUp(user);
    const first = await db.doc(`users/${uid}`).get();
    expect(set).toHaveBeenCalledTimes(1);

    await signUp(user);

    const second = await db.doc(`users/${uid}`).get();
    expect(second.data()).toEqual(first.data());
    // The emulator skips a no-op write without bumping updateTime, so the
    // transaction's set is what shows a redundant write was attempted.
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('rethrows when the profile cannot be written, so Auth retries the trigger', async () => {
    const uid = `u-${randomUUID()}`;
    vi.spyOn(db, 'runTransaction').mockRejectedValue(new Error('firestore down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(signUp({ uid, emailVerified: false })).rejects.toThrow(
      'firestore down'
    );
  });
});

describe('profileEmail', () => {
  it('is the address only when it is verified', () => {
    expect(profileEmail({ email: 'a@x.com', emailVerified: true })).toBe('a@x.com');
    expect(profileEmail({ email: 'a@x.com', emailVerified: false })).toBe('');
    expect(profileEmail({ email: 'a@x.com' })).toBe('');
    expect(profileEmail({ emailVerified: true })).toBe('');
  });
});
