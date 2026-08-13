import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { linkInvitedMembersInternal } from './index';

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
