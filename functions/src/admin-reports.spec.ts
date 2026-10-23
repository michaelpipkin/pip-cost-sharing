import type {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// Side-effect import: index.ts calls initializeApp() at module scope, which
// every admin-reports test needs before getFirestore() below will work -
// mirrors the same pattern in link-invited-members.spec.ts etc.
import './index';
import {
  aggregateGroupStats,
  backfillOrphanedRegistrationsInternal,
  buildActiveGroupsReport,
  buildDaysAgoIso,
  buildOrphanedMembersReport,
  buildThirtyDaysAgoIso,
  getAdminExcludedGroupIds,
  getGroupStats,
  repairOrphanedMembersInternal,
  summarizeGroups,
} from './admin-reports';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';
import { upsertVerifiedEmail } from './verified-emails';

const db = getFirestore();

describe('buildThirtyDaysAgoIso', () => {
  it('returns a YYYY-MM-DD string exactly 30 days before today', () => {
    const iso = buildThirtyDaysAgoIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const expected = new Date();
    expected.setDate(expected.getDate() - 30);
    const expectedIso = `${expected.getFullYear()}-${String(
      expected.getMonth() + 1
    ).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(iso).toBe(expectedIso);
  });
});

describe('buildDaysAgoIso', () => {
  it('matches buildThirtyDaysAgoIso for 30 days', () => {
    expect(buildDaysAgoIso(30)).toBe(buildThirtyDaysAgoIso());
  });

  it('returns today for 0 days', () => {
    const today = new Date();
    const expectedIso = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(buildDaysAgoIso(0)).toBe(expectedIso);
  });
});

describe('getAdminExcludedGroupIds', () => {
  it('returns ids of groups where the admin has an active membership only', async () => {
    const adminUserRef = db.collection('users').doc();

    const groupWithActiveAdmin = db.collection('groups').doc();
    await groupWithActiveAdmin
      .collection('members')
      .doc()
      .set({ userRef: adminUserRef, active: true });

    const groupWithInactiveAdmin = db.collection('groups').doc();
    await groupWithInactiveAdmin
      .collection('members')
      .doc()
      .set({ userRef: adminUserRef, active: false });

    const groupWithoutAdmin = db.collection('groups').doc();
    await groupWithoutAdmin
      .collection('members')
      .doc()
      .set({ userRef: db.collection('users').doc(), active: true });

    const excluded = await getAdminExcludedGroupIds(db, adminUserRef);

    expect(excluded.has(groupWithActiveAdmin.id)).toBe(true);
    expect(excluded.has(groupWithInactiveAdmin.id)).toBe(false);
    expect(excluded.has(groupWithoutAdmin.id)).toBe(false);
  });
});

function fakeGroupDoc(id: string, data: DocumentData): QueryDocumentSnapshot {
  return {
    id,
    data: () => data,
    ref: { id } as DocumentReference,
  } as unknown as QueryDocumentSnapshot;
}

describe('summarizeGroups', () => {
  it('counts total/active groups and collects refs for active, non-excluded groups only', () => {
    const docs = [
      fakeGroupDoc('g1', { active: true, archived: false }),
      fakeGroupDoc('g2', { active: false, archived: false }),
      fakeGroupDoc('g3', { active: true, archived: true }),
      fakeGroupDoc('g4', { active: true, archived: false }), // excluded below
    ];
    const snapshot = { docs } as unknown as QuerySnapshot;

    const result = summarizeGroups(snapshot, new Set(['g4']));

    expect(result.totalGroups).toBe(3); // g4 excluded from the count entirely
    expect(result.activeGroups).toBe(1); // only g1 is active and non-archived
    expect(result.activeGroupRefs.map((r) => r.id)).toEqual(['g1']);
  });
});

describe('getGroupStats', () => {
  it('aggregates member and expense counts for a single group', async () => {
    const groupRef = db.collection('groups').doc();
    await groupRef.collection('members').doc().set({ active: true });
    await groupRef.collection('members').doc().set({ active: false });
    await groupRef.collection('expenses').doc().set({ date: '2020-01-01' });

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    const recentIso = recentDate.toISOString().slice(0, 10);
    await groupRef.collection('expenses').doc().set({ date: recentIso });

    const thirtyDaysAgoIso = buildThirtyDaysAgoIso();
    const stats = await getGroupStats(groupRef, thirtyDaysAgoIso);

    expect(stats.totalMembers).toBe(2);
    expect(stats.activeMembers).toBe(1);
    expect(stats.hasExpenses).toBe(true);
    expect(stats.recentExpenses).toBe(1);
  });

  it('reports hasExpenses false and zero counts for an empty group', async () => {
    const groupRef = db.collection('groups').doc();
    const thirtyDaysAgoIso = buildThirtyDaysAgoIso();
    const stats = await getGroupStats(groupRef, thirtyDaysAgoIso);

    expect(stats.totalMembers).toBe(0);
    expect(stats.hasExpenses).toBe(false);
    expect(stats.recentExpenses).toBe(0);
  });
});

describe('aggregateGroupStats', () => {
  it('sums totals and tallies groups with multiple members / expenses / recent activity', () => {
    const result = aggregateGroupStats([
      { totalMembers: 3, activeMembers: 2, hasExpenses: true, recentExpenses: 1 },
      { totalMembers: 1, activeMembers: 1, hasExpenses: false, recentExpenses: 0 },
      { totalMembers: 5, activeMembers: 3, hasExpenses: true, recentExpenses: 2 },
    ]);

    expect(result.totalMembers).toBe(9);
    expect(result.totalActiveMembers).toBe(6);
    expect(result.activeGroupsWithMultipleMembers).toBe(2);
    expect(result.activeGroupsWithExpenses).toBe(2);
    expect(result.groupsWithRecentActivity).toBe(2);
    expect(result.expensesCreatedLast30Days).toBe(3);
  });
});

describe('buildActiveGroupsReport', () => {
  it('excludes archived groups, groups under 2 members, and groups with no recent activity', async () => {
    const today = buildDaysAgoIso(0);
    const stale = buildDaysAgoIso(90);

    // Qualifies: active, not archived, 2 members, an expense today.
    const qualifying = db.collection('groups').doc();
    await qualifying.set({ name: 'Qualifying Group', active: true, archived: false });
    await qualifying.collection('members').doc().set({ active: true, email: 'a@example.com' });
    await qualifying.collection('members').doc().set({ active: true, email: 'b@example.com' });
    await qualifying.collection('expenses').doc().set({ date: today });

    // Archived - should be excluded even though active is true.
    const archived = db.collection('groups').doc();
    await archived.set({ name: 'Archived Group', active: true, archived: true });
    await archived.collection('members').doc().set({ active: true, email: 'c@example.com' });
    await archived.collection('members').doc().set({ active: true, email: 'd@example.com' });
    await archived.collection('expenses').doc().set({ date: today });

    // Only 1 member - excluded.
    const soloMember = db.collection('groups').doc();
    await soloMember.set({ name: 'Solo Group', active: true, archived: false });
    await soloMember.collection('members').doc().set({ active: true, email: 'e@example.com' });
    await soloMember.collection('expenses').doc().set({ date: today });

    // Stale - last expense is outside the 30-day window, no history at all.
    const staleGroup = db.collection('groups').doc();
    await staleGroup.set({ name: 'Stale Group', active: true, archived: false });
    await staleGroup.collection('members').doc().set({ active: true, email: 'f@example.com' });
    await staleGroup.collection('members').doc().set({ active: true, email: 'g@example.com' });
    await staleGroup.collection('expenses').doc().set({ date: stale });

    const result = await buildActiveGroupsReport(db);
    const groupIds = result.tables[0]!.rows.map((r) => r['groupId']);

    expect(groupIds).toContain(qualifying.id);
    expect(groupIds).not.toContain(archived.id);
    expect(groupIds).not.toContain(soloMember.id);
    expect(groupIds).not.toContain(staleGroup.id);
  });
});

describe('buildOrphanedMembersReport', () => {
  function stat(
    result: Awaited<ReturnType<typeof buildOrphanedMembersReport>>,
    label: string
  ) {
    return result.summary[0]!.stats.find((s) => s.label === label)?.value as number;
  }

  it('counts a row as linkable when its address has an index owner and unmatched otherwise', async () => {
    const tag = uniqueId('orph');
    const owned = `${tag}-owned@Example.com`;
    const owner = uniqueId('owner');
    await upsertVerifiedEmail(db, owned, owner, 'login');
    // A profile email alone is not proof of the address, so it matches nothing.
    const profileOnly = `${tag}-profile@example.com`;
    await db.collection('users').doc(uniqueId('u')).set({
      email: profileOnly,
      emailLower: profileOnly,
    });
    const before = await buildOrphanedMembersReport(db);

    const group = await makeGroup();
    const linkableMember = await makeMember(group, {
      email: owned.toLowerCase(),
      displayName: 'Owned',
    });
    const unmatchedMember = await makeMember(group, {
      email: profileOnly,
      displayName: 'Profile Only',
    });
    const placeholder = await makeMember(group, { email: '', displayName: 'Placeholder' });
    const blank = await makeMember(group, { email: '  ', displayName: 'Blank' });

    const result = await buildOrphanedMembersReport(db);

    expect(result.tables.map((t) => t.title)).toEqual(['Linkable']);
    expect(result.summary[0]!.stats.map((s) => s.label)).not.toContain(
      'Needs Manual Review'
    );
    const rows = result.tables[0]!.rows;
    expect(rows.find((r) => r['path'] === linkableMember.path)).toMatchObject({
      matchedUserId: owner,
      email: owned.toLowerCase(),
    });
    for (const ref of [unmatchedMember, placeholder, blank]) {
      expect(rows.some((r) => r['path'] === ref.path)).toBe(false);
    }
    expect(
      stat(result, 'Linkable (exact email match)') -
        stat(before, 'Linkable (exact email match)')
    ).toBe(1);
    expect(stat(result, 'No Matching User') - stat(before, 'No Matching User')).toBe(1);
  });
});

describe('repairOrphanedMembersInternal', () => {
  it('links a member whose address has an index owner and skips already-linked ones', async () => {
    const address = `${uniqueId('link')}@example.com`;
    const owner = uniqueId('owner');
    await upsertVerifiedEmail(db, address, owner, 'login');
    const group = await makeGroup();

    const linkable = await makeMember(group, { email: address.toUpperCase() });
    const someUser = db.collection('users').doc(uniqueId('u'));
    const alreadyLinked = await makeMember(group, {
      userRef: someUser,
      email: `${uniqueId('already')}@example.com`,
    });

    const result = await repairOrphanedMembersInternal(db, [
      linkable.path,
      alreadyLinked.path,
    ]);

    expect(result.linkedCount).toBe(1);
    const linkableRef = (await linkable.get()).get('userRef') as DocumentReference;
    expect(linkableRef.path).toBe(`users/${owner}`);
    const alreadyRef = (await alreadyLinked.get()).get('userRef') as DocumentReference;
    expect(alreadyRef.id).toBe(someUser.id);
  });

  it('does not link through a profile email that is not in the index', async () => {
    const address = `${uniqueId('profile')}@example.com`;
    await db.collection('users').doc(uniqueId('u')).set({
      email: address,
      emailLower: address,
    });
    const orphan = await makeMember(await makeGroup(), { email: address });

    const result = await repairOrphanedMembersInternal(db, [orphan.path]);

    expect(result.linkedCount).toBe(0);
    expect((await orphan.get()).get('userRef')).toBeNull();
  });

  // One user on two rows of a group would count twice in its balances.
  it('does not link a row in a group where the matched user already has a row', async () => {
    const address = `${uniqueId('repair-dup')}@example.com`;
    const owner = uniqueId('owner');
    await upsertVerifiedEmail(db, address, owner, 'login');
    const group = await makeGroup();
    await makeMember(group, { userRef: db.doc(`users/${owner}`), email: address });
    const orphan = await makeMember(group, { email: address });

    const result = await repairOrphanedMembersInternal(db, [orphan.path]);

    expect(result.linkedCount).toBe(0);
    expect((await orphan.get()).get('userRef')).toBeNull();
  });

  it('links only one of two orphan rows for the same user in one group', async () => {
    const owner = uniqueId('owner');
    const first = `${uniqueId('repair-one')}@example.com`;
    const second = `${uniqueId('repair-two')}@example.com`;
    await upsertVerifiedEmail(db, first, owner, 'login');
    await upsertVerifiedEmail(db, second, owner, 'group-confirm');
    const group = await makeGroup();
    const rowA = await makeMember(group, { email: first });
    const rowB = await makeMember(group, { email: second });

    const result = await repairOrphanedMembersInternal(db, [rowA.path, rowB.path]);

    expect(result.linkedCount).toBe(1);
    const linked = [
      (await rowA.get()).get('userRef'),
      (await rowB.get()).get('userRef'),
    ].filter((ref) => ref !== null);
    expect(linked).toHaveLength(1);
  });
});

describe('backfillOrphanedRegistrationsInternal', () => {
  it('copies only a verified Auth address into the new profile', async () => {
    const auth = getAuth();
    const id = Math.random().toString(36).slice(2, 10);
    const verified = await auth.createUser({
      email: `backfill-verified-${id}@example.com`,
      emailVerified: true,
    });
    const unverified = await auth.createUser({
      email: `backfill-unverified-${id}@example.com`,
      emailVerified: false,
    });
    // The onCreate trigger isn't running here (no functions emulator), so
    // neither has a profile yet; drop any just in case.
    await db.doc(`users/${verified.uid}`).delete();
    await db.doc(`users/${unverified.uid}`).delete();

    const result = await backfillOrphanedRegistrationsInternal(db, auth, [
      verified.uid,
      unverified.uid,
    ]);

    expect(result.createdCount).toBe(2);
    expect((await db.doc(`users/${verified.uid}`).get()).data()?.['email']).toBe(
      verified.email
    );
    expect((await db.doc(`users/${unverified.uid}`).get()).data()?.['email']).toBe('');
  });
});
