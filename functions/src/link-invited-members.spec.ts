import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { linkInvitedMembers, linkInvitedMembersInternal } from './index';

const db = getFirestore();

describe('linkInvitedMembersInternal', () => {
  it('links an unlinked member whose email differs only by casing', async () => {
    const groupRef = db.collection('groups').doc();
    const memberRef = groupRef.collection('members').doc();
    await memberRef.set({
      displayName: 'Alex',
      email: 'Alex@Example.com',
      emailLower: 'alex@example.com',
      active: true,
      groupAdmin: false,
      userRef: null,
    });
    const userRef = db.collection('users').doc();
    await userRef.set({ email: 'alex@example.com' });

    const result = await linkInvitedMembersInternal(
      userRef.id,
      'ALEX@EXAMPLE.COM'
    );

    expect(result.membersLinked).toBe(1);
    const updated = await memberRef.get();
    expect(updated.data()?.['userRef']?.id).toBe(userRef.id);
  });

  it('does not link a member that is already linked', async () => {
    const groupRef = db.collection('groups').doc();
    const memberRef = groupRef.collection('members').doc();
    const existingUserRef = db.collection('users').doc();
    await memberRef.set({
      displayName: 'Alex',
      email: 'alex@example.com',
      emailLower: 'alex@example.com',
      active: true,
      groupAdmin: false,
      userRef: existingUserRef,
    });
    const newUserRef = db.collection('users').doc();
    await newUserRef.set({ email: 'alex@example.com' });

    const result = await linkInvitedMembersInternal(
      newUserRef.id,
      'alex@example.com'
    );

    expect(result.membersLinked).toBe(0);
    const unchanged = await memberRef.get();
    expect(unchanged.data()?.['userRef']?.id).toBe(existingUserRef.id);
  });

  it('returns zero when no member matches the email', async () => {
    const userRef = db.collection('users').doc();
    await userRef.set({ email: 'nobody@example.com' });

    const result = await linkInvitedMembersInternal(
      userRef.id,
      'nobody@example.com'
    );

    expect(result.membersLinked).toBe(0);
  });
});

// The callable as the client calls it. Every test uses its own random
// addresses and asserts only on its own member docs.
describe('linkInvitedMembers callable', () => {
  type Token = { email?: string; email_verified?: boolean };

  function call(uid: string | null, token: Token, data: unknown = {}) {
    return Promise.resolve(
      linkInvitedMembers.run({
        auth: uid ? { uid, token } : undefined,
        data,
      } as any)
    );
  }

  async function invitedMember(email: string) {
    const ref = db
      .collection('groups')
      .doc()
      .collection('members')
      .doc();
    await ref.set({
      displayName: 'Invitee',
      email,
      emailLower: email.toLowerCase(),
      active: true,
      groupAdmin: false,
      userRef: null,
    });
    return ref;
  }

  async function linkedUid(
    ref: DocumentReference
  ): Promise<string | null> {
    return (await ref.get()).data()?.['userRef']?.id ?? null;
  }

  const address = (name: string) => `${name}-${randomUUID()}@example.com`;

  it('refuses a caller whose token email is unverified and links nothing', async () => {
    const own = address('unverified');
    const member = await invitedMember(own);
    const uid = `u-${randomUUID()}`;

    await expect(
      call(uid, { email: own, email_verified: false }, { email: own })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Verify your email address first',
    });
    expect(await linkedUid(member)).toBeNull();
  });

  it('refuses a caller with no email claim at all', async () => {
    await expect(
      call(`u-${randomUUID()}`, { email_verified: true })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('ignores a different data.email and links only members matching the token email', async () => {
    const attacker = address('attacker');
    const victim = address('victim');
    const attackerMember = await invitedMember(attacker);
    const victimMember = await invitedMember(victim);
    const uid = `u-${randomUUID()}`;

    const result = await call(
      uid,
      { email: attacker, email_verified: true },
      { email: victim }
    );

    expect(await linkedUid(victimMember)).toBeNull();
    expect(await linkedUid(attackerMember)).toBe(uid);
    expect(result).toEqual({ membersLinked: 1 });
  });

  it('links a verified caller to their own invited members without data.email', async () => {
    const own = address('own');
    const first = await invitedMember(own);
    const second = await invitedMember(own.toUpperCase());
    const uid = `u-${randomUUID()}`;

    const result = await call(uid, { email: own, email_verified: true });

    expect(result).toEqual({ membersLinked: 2 });
    expect(await linkedUid(first)).toBe(uid);
    expect(await linkedUid(second)).toBe(uid);
  });

  it('links by the Auth record when the token predates verification (stale token)', async () => {
    const own = address('stale');
    const member = await invitedMember(own);
    const record = await getAuth().createUser({ email: own, emailVerified: true });

    const result = await call(
      record.uid,
      { email: own, email_verified: false },
      { email: address('victim') }
    );

    expect(result).toEqual({ membersLinked: 1 });
    expect(await linkedUid(member)).toBe(record.uid);
  });

  it('still refuses when neither the token nor the Auth record is verified', async () => {
    const own = address('never');
    const member = await invitedMember(own);
    const record = await getAuth().createUser({ email: own, emailVerified: false });

    await expect(
      call(record.uid, { email: own, email_verified: false })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await linkedUid(member)).toBeNull();
  });

  it('matches a token address that differs in case from the invite', async () => {
    const own = address('Case');
    const member = await invitedMember(own.toLowerCase());
    const uid = `u-${randomUUID()}`;

    const result = await call(
      uid,
      { email: own.toUpperCase(), email_verified: true },
      { email: address('unrelated') }
    );

    expect(result).toEqual({ membersLinked: 1 });
    expect(await linkedUid(member)).toBe(uid);
  });

  it('refuses an unauthenticated call', async () => {
    await expect(call(null, {})).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
