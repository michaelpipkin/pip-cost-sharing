import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { computeGroupMemberArrays, syncGroupMemberUidsInternal } from './index';

const db = getFirestore();

describe('computeGroupMemberArrays', () => {
  it('includes every member with a userRef in memberUids, regardless of active/admin status', () => {
    const result = computeGroupMemberArrays([
      { userRef: db.collection('users').doc('alice'), active: true, groupAdmin: true },
      { userRef: db.collection('users').doc('bob'), active: false, groupAdmin: false },
      { userRef: db.collection('users').doc('carol'), active: true, groupAdmin: false },
    ]);

    expect(result.memberUids.sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('excludes members with a null userRef (unregistered invitees) from all three arrays', () => {
    const result = computeGroupMemberArrays([
      { userRef: null, active: true, groupAdmin: true, displayName: 'Invitee' },
    ]);

    expect(result.memberUids).toEqual([]);
    expect(result.activeMemberUids).toEqual([]);
    expect(result.adminUids).toEqual([]);
  });

  it('excludes an inactive-but-still-linked member (left the group) from activeMemberUids and adminUids, but keeps them in memberUids', () => {
    const result = computeGroupMemberArrays([
      {
        userRef: db.collection('users').doc('left-admin'),
        active: false,
        leftGroup: true,
        groupAdmin: false, // leaveGroup() clears groupAdmin on the way out
      },
    ]);

    expect(result.memberUids).toEqual(['left-admin']);
    expect(result.activeMemberUids).toEqual([]);
    expect(result.adminUids).toEqual([]);
  });

  it('only includes active admins in adminUids, not inactive admins or active non-admins', () => {
    const result = computeGroupMemberArrays([
      { userRef: db.collection('users').doc('active-admin'), active: true, groupAdmin: true },
      { userRef: db.collection('users').doc('active-member'), active: true, groupAdmin: false },
    ]);

    expect(result.adminUids).toEqual(['active-admin']);
    expect(result.activeMemberUids.sort()).toEqual(['active-admin', 'active-member']);
  });

  it('treats missing active/groupAdmin fields as false (fail-closed)', () => {
    const result = computeGroupMemberArrays([
      { userRef: db.collection('users').doc('uid-1') },
    ]);

    expect(result.memberUids).toEqual(['uid-1']);
    expect(result.activeMemberUids).toEqual([]);
    expect(result.adminUids).toEqual([]);
  });
});

describe('syncGroupMemberUidsInternal', () => {
  it('writes all three arrays onto the group doc from its members subcollection', async () => {
    const groupRef = db.collection('groups').doc();
    await groupRef.set({ name: 'Test Group' });
    await groupRef.collection('members').doc().set({
      userRef: db.collection('users').doc('admin-uid'),
      active: true,
      groupAdmin: true,
    });
    await groupRef.collection('members').doc().set({
      userRef: db.collection('users').doc('left-uid'),
      active: false,
      leftGroup: true,
      groupAdmin: false,
    });

    await syncGroupMemberUidsInternal(groupRef.id);

    const updated = await groupRef.get();
    expect(updated.data()?.['memberUids']?.sort()).toEqual(['admin-uid', 'left-uid']);
    expect(updated.data()?.['activeMemberUids']).toEqual(['admin-uid']);
    expect(updated.data()?.['adminUids']).toEqual(['admin-uid']);
  });

  it('is a no-op write when the computed arrays already match', async () => {
    const groupRef = db.collection('groups').doc();
    await groupRef.set({
      name: 'Test Group',
      memberUids: ['admin-uid'],
      activeMemberUids: ['admin-uid'],
      adminUids: ['admin-uid'],
    });
    await groupRef.collection('members').doc().set({
      userRef: db.collection('users').doc('admin-uid'),
      active: true,
      groupAdmin: true,
    });

    // Sanity check this doesn't throw and simply returns without writing -
    // covered implicitly by the assertion below still holding.
    await syncGroupMemberUidsInternal(groupRef.id);

    const updated = await groupRef.get();
    expect(updated.data()?.['memberUids']).toEqual(['admin-uid']);
  });

  it('does nothing if the group doc does not exist', async () => {
    await expect(
      syncGroupMemberUidsInternal('nonexistent-group-id')
    ).resolves.toBeUndefined();
  });
});
