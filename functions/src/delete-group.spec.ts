import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// index.ts initialises the Admin SDK and exports the callable.
import { deleteGroup } from './index';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

const db = getFirestore();

function call(uid: string | null, data: unknown) {
  return Promise.resolve(
    deleteGroup.run({
      auth: uid ? { uid, token: {} } : undefined,
      data,
    } as any)
  );
}

/** A group with one member linked to `uid`. */
async function groupWith(
  uid: string,
  member: { groupAdmin?: boolean; active?: boolean } = {}
) {
  const group = await makeGroup();
  await makeMember(group, {
    userRef: db.collection('users').doc(uid),
    ...member,
  });
  return group;
}

describe('deleteGroup: guards', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(call(null, { groupId: 'g' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it.each([
    ['no groupId', {}],
    ['an empty groupId', { groupId: '' }],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    await expect(call(uniqueId('u'), data)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('refuses a plain member and leaves the group untouched', async () => {
    const uid = uniqueId('u');
    const group = await groupWith(uid, { groupAdmin: false });

    await expect(call(uid, { groupId: group.id })).rejects.toMatchObject({
      code: 'permission-denied',
    });

    expect((await group.get()).exists).toBe(true);
    expect((await group.collection('members').get()).size).toBe(1);
  });

  it('refuses an admin of a different group and leaves the group untouched', async () => {
    const uid = uniqueId('u');
    await groupWith(uid, { groupAdmin: true });
    const target = await makeGroup();
    await makeMember(target, {
      userRef: db.collection('users').doc(uniqueId('owner')),
      groupAdmin: true,
    });

    await expect(call(uid, { groupId: target.id })).rejects.toMatchObject({
      code: 'permission-denied',
    });

    expect((await target.get()).exists).toBe(true);
    expect((await target.collection('members').get()).size).toBe(1);
  });

  // BUG (B2): functions/src/index.ts:552 reads request.data.groupId before
  // any check, so a call with no payload throws a TypeError (surfacing as an
  // opaque internal error to the client) instead of invalid-argument.
  it.fails('rejects a null payload with an HttpsError, not a TypeError', async () => {
    const error = await call(uniqueId('u'), null).catch((e) => e);

    expect(['unauthenticated', 'invalid-argument']).toContain(error?.code);
  });

  // BUG (B2): functions/src/index.ts:567-572 matches on groupAdmin alone and
  // never checks `active`, so a member who left the group (active false) can
  // still delete it.
  it.fails('refuses an inactive admin', async () => {
    const uid = uniqueId('u');
    const group = await groupWith(uid, { groupAdmin: true, active: false });
    await makeMember(group, {
      userRef: db.collection('users').doc(uniqueId('stay')),
      groupAdmin: true,
    });

    await expect(call(uid, { groupId: group.id })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

describe('deleteGroup: an admin', () => {
  it('deletes the group together with its subcollections', async () => {
    const uid = uniqueId('u');
    const group = await groupWith(uid, { groupAdmin: true });
    const other = await makeMember(group, { displayName: 'Other' });
    const category = await group.collection('categories').add({ name: 'Food' });
    const expense = await group.collection('expenses').add({ amount: 5 });
    const split = await group.collection('splits').add({ amount: 5 });
    const memorized = await group.collection('memorized').add({ name: 'm' });

    await expect(call(uid, { groupId: group.id })).resolves.toEqual({
      success: true,
      message: 'Group and all associated data successfully deleted',
    });

    expect((await group.get()).exists).toBe(false);
    expect((await group.collection('members').get()).size).toBe(0);
    for (const ref of [other, category, expense, split, memorized]) {
      expect((await ref.get()).exists).toBe(false);
    }
  });

  it('does not touch another group', async () => {
    const uid = uniqueId('u');
    const mine = await groupWith(uid, { groupAdmin: true });
    const bystander = await makeGroup();
    const bystanderMember = await makeMember(bystander);

    await call(uid, { groupId: mine.id });

    expect((await bystander.get()).exists).toBe(true);
    expect((await bystanderMember.get()).exists).toBe(true);
  });
});
