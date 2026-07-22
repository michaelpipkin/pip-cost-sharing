import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { describe, expect, it } from 'vitest';
import {
  deleteGroupInternal,
  deleteOrphanedGroups,
  handleUserGroupMembership,
  processUserGroupMemberships,
  tryGetAuthEmail,
} from './index';

const db = getFirestore();

describe('handleUserGroupMembership', () => {
  it('marks the group for deletion when the user is the only active member', async () => {
    const groupRef = db.collection('groups').doc();
    const membersRef = groupRef.collection('members');
    const userMemberRef = membersRef.doc();
    await userMemberRef.set({
      active: true,
      groupAdmin: true,
      userRef: db.collection('users').doc(),
    });

    const membersSnapshot = await membersRef.get();
    const userMemberDoc = membersSnapshot.docs.find(
      (d) => d.id === userMemberRef.id
    )!;

    const shouldDelete = await handleUserGroupMembership(
      groupRef,
      userMemberDoc,
      membersSnapshot.docs
    );

    expect(shouldDelete).toBe(true);
  });

  it('promotes other active members and demotes/anonymizes the user when the user is the sole admin', async () => {
    const groupRef = db.collection('groups').doc();
    const membersRef = groupRef.collection('members');
    const adminMemberRef = membersRef.doc();
    const otherMemberRef = membersRef.doc();
    await adminMemberRef.set({
      active: true,
      groupAdmin: true,
      userRef: db.collection('users').doc(),
    });
    await otherMemberRef.set({
      active: true,
      groupAdmin: false,
      userRef: db.collection('users').doc(),
    });

    const membersSnapshot = await membersRef.get();
    const userMemberDoc = membersSnapshot.docs.find(
      (d) => d.id === adminMemberRef.id
    )!;

    const shouldDelete = await handleUserGroupMembership(
      groupRef,
      userMemberDoc,
      membersSnapshot.docs
    );

    expect(shouldDelete).toBe(false);

    const updatedOther = await otherMemberRef.get();
    expect(updatedOther.data()?.['groupAdmin']).toBe(true);

    const updatedAdmin = await adminMemberRef.get();
    expect(updatedAdmin.data()?.['groupAdmin']).toBe(false);
    expect(updatedAdmin.data()?.['userRef']).toBeNull();
  });

  it('only anonymizes the user’s own record when other admins already exist', async () => {
    const groupRef = db.collection('groups').doc();
    const membersRef = groupRef.collection('members');
    const userMemberRef = membersRef.doc();
    const otherAdminRef = membersRef.doc();
    await userMemberRef.set({
      active: true,
      groupAdmin: true,
      userRef: db.collection('users').doc(),
    });
    await otherAdminRef.set({
      active: true,
      groupAdmin: true,
      userRef: db.collection('users').doc(),
    });

    const membersSnapshot = await membersRef.get();
    const userMemberDoc = membersSnapshot.docs.find(
      (d) => d.id === userMemberRef.id
    )!;

    const shouldDelete = await handleUserGroupMembership(
      groupRef,
      userMemberDoc,
      membersSnapshot.docs
    );

    expect(shouldDelete).toBe(false);

    const updatedUser = await userMemberRef.get();
    expect(updatedUser.data()?.['userRef']).toBeNull();
    expect(updatedUser.data()?.['groupAdmin']).toBe(true); // untouched

    const updatedOtherAdmin = await otherAdminRef.get();
    expect(updatedOtherAdmin.data()?.['groupAdmin']).toBe(true); // untouched
  });
});

describe('processUserGroupMemberships', () => {
  it('collects sole-active-member groups for deletion and anonymizes membership elsewhere', async () => {
    const userDocRef = db.collection('users').doc();

    // A group doc must have its own data to show up in a top-level
    // `collection('groups').get()` scan — Firestore doesn't surface docs
    // that exist only implicitly as a subcollection ancestor.
    const soleGroupRef = db.collection('groups').doc();
    await soleGroupRef.set({ name: 'Sole' });
    await soleGroupRef.collection('members').doc().set({
      active: true,
      groupAdmin: true,
      userRef: userDocRef,
    });

    const sharedGroupRef = db.collection('groups').doc();
    await sharedGroupRef.set({ name: 'Shared' });
    const userMemberRef = sharedGroupRef.collection('members').doc();
    await userMemberRef.set({
      active: true,
      groupAdmin: false,
      userRef: userDocRef,
    });
    await sharedGroupRef
      .collection('members')
      .doc()
      .set({
        active: true,
        groupAdmin: true,
        userRef: db.collection('users').doc(),
      });

    const groupsToDelete = await processUserGroupMemberships(userDocRef);

    expect(groupsToDelete.some((g) => g.path === soleGroupRef.path)).toBe(true);
    expect(groupsToDelete.some((g) => g.path === sharedGroupRef.path)).toBe(
      false
    );

    const updatedUserMember = await userMemberRef.get();
    expect(updatedUserMember.data()?.['userRef']).toBeNull();
  });
});

describe('deleteOrphanedGroups', () => {
  it('deletes every group in the list', async () => {
    const groupRef = db.collection('groups').doc();
    await groupRef.collection('members').doc().set({ active: true });

    await deleteOrphanedGroups([groupRef]);

    const groupDoc = await groupRef.get();
    expect(groupDoc.exists).toBe(false);
  });
});

describe('deleteGroupInternal', () => {
  it('cascades deletion across subcollections, receipts, defaultGroupRef, and the group doc itself', async () => {
    const groupRef = db.collection('groups').doc();
    await groupRef.set({ name: 'Test Group' });
    await groupRef.collection('members').doc().set({ active: true });
    await groupRef.collection('categories').doc().set({ name: 'Cat' });
    await groupRef.collection('expenses').doc().set({ amount: 10 });

    const userWithDefaultRef = db.collection('users').doc();
    await userWithDefaultRef.set({ defaultGroupRef: groupRef });

    const bucket = getStorage().bucket();
    const receiptPath = `groups/${groupRef.id}/receipts/receipt1.jpg`;
    await bucket.file(receiptPath).save(Buffer.from('fake-image-data'));

    await deleteGroupInternal(groupRef);

    const groupDoc = await groupRef.get();
    expect(groupDoc.exists).toBe(false);

    const membersSnap = await groupRef.collection('members').get();
    expect(membersSnap.empty).toBe(true);

    const [remainingFiles] = await bucket.getFiles({
      prefix: `groups/${groupRef.id}/receipts/`,
    });
    expect(remainingFiles).toHaveLength(0);

    const updatedUser = await userWithDefaultRef.get();
    expect(updatedUser.data()?.['defaultGroupRef']).toBeNull();
  });

  it('does not fail when the group has no receipts and no users default to it', async () => {
    const groupRef = db.collection('groups').doc();
    await groupRef.set({ name: 'Empty Group' });

    await expect(deleteGroupInternal(groupRef)).resolves.not.toThrow();

    const groupDoc = await groupRef.get();
    expect(groupDoc.exists).toBe(false);
  });
});

describe('tryGetAuthEmail', () => {
  it('returns the email and increments synced when the auth user exists with an email', async () => {
    const user = await getAuth().createUser({ email: 'sync-me@example.com' });
    try {
      const results = { synced: 0, skipped: 0, errors: [] as string[] };
      const email = await tryGetAuthEmail(user.uid, results);

      expect(email).toBe('sync-me@example.com');
      expect(results.synced).toBe(1);
      expect(results.skipped).toBe(0);
    } finally {
      await getAuth().deleteUser(user.uid);
    }
  });

  it('returns null and increments skipped when the auth user has no email', async () => {
    const user = await getAuth().createUser({
      phoneNumber: `+1555${Math.floor(1000000 + Math.random() * 8999999)}`,
    });
    try {
      const results = { synced: 0, skipped: 0, errors: [] as string[] };
      const email = await tryGetAuthEmail(user.uid, results);

      expect(email).toBeNull();
      expect(results.skipped).toBe(1);
      expect(results.synced).toBe(0);
    } finally {
      await getAuth().deleteUser(user.uid);
    }
  });

  it('returns null and records an error when the uid does not exist', async () => {
    const results = { synced: 0, skipped: 0, errors: [] as string[] };
    const email = await tryGetAuthEmail('does-not-exist-uid', results);

    expect(email).toBeNull();
    expect(results.errors).toHaveLength(1);
    expect(results.errors[0]).toContain('does-not-exist-uid');
  });
});
