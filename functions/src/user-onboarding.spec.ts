import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { profileEmail } from './common';
import { createUserProfileOnSignUp } from './index';

const db = getFirestore();

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

describe('profileEmail', () => {
  it('is the address only when it is verified', () => {
    expect(profileEmail({ email: 'a@x.com', emailVerified: true })).toBe('a@x.com');
    expect(profileEmail({ email: 'a@x.com', emailVerified: false })).toBe('');
    expect(profileEmail({ email: 'a@x.com' })).toBe('');
    expect(profileEmail({ emailVerified: true })).toBe('');
  });
});
