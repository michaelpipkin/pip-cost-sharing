import type {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// Side-effect import: index.ts calls initializeApp() at module scope, which
// every admin-reports test needs before getFirestore() below will work -
// mirrors the same pattern in link-invited-members.spec.ts etc.
import './index';
import {
  aggregateGroupStats,
  buildActiveGroupsReport,
  buildDaysAgoIso,
  buildOrphanedMembersReport,
  buildThirtyDaysAgoIso,
  getAdminExcludedGroupIds,
  getGroupStats,
  repairOrphanedMembersInternal,
  summarizeGroups,
} from './admin-reports';

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
  it('separates a single email match from multiple candidate matches', async () => {
    const group = db.collection('groups').doc();

    const singleMatchUser = db.collection('users').doc();
    await singleMatchUser.set({ email: 'single@example.com', emailLower: 'single@example.com' });

    const dupeUserA = db.collection('users').doc();
    await dupeUserA.set({ email: 'dupe@example.com', emailLower: 'dupe@example.com' });
    const dupeUserB = db.collection('users').doc();
    await dupeUserB.set({ email: 'DUPE@example.com', emailLower: 'dupe@example.com' });

    const linkableMember = group.collection('members').doc();
    await linkableMember.set({
      userRef: null,
      email: 'single@example.com',
      displayName: 'Single Match',
    });

    const reviewMember = group.collection('members').doc();
    await reviewMember.set({
      userRef: null,
      email: 'dupe@example.com',
      displayName: 'Needs Review',
    });

    const placeholderMember = group.collection('members').doc();
    await placeholderMember.set({ userRef: null, email: '', displayName: 'Placeholder' });

    const result = await buildOrphanedMembersReport(db);
    const linkableTable = result.tables[0]!;
    const reviewTable = result.tables[1]!;

    expect(linkableTable.rows.some((r) => r['path'] === linkableMember.path)).toBe(true);
    expect(reviewTable.rows.some((r) => r['displayName'] === 'Needs Review')).toBe(true);
    expect(linkableTable.rows.some((r) => r['displayName'] === 'Placeholder')).toBe(false);
    expect(reviewTable.rows.some((r) => r['displayName'] === 'Placeholder')).toBe(false);
  });
});

describe('repairOrphanedMembersInternal', () => {
  it('links a member with exactly one matching user and skips ambiguous/already-linked ones', async () => {
    const group = db.collection('groups').doc();

    const matchedUser = db.collection('users').doc();
    await matchedUser.set({ email: 'link@example.com', emailLower: 'link@example.com' });

    const linkable = group.collection('members').doc();
    await linkable.set({ userRef: null, email: 'link@example.com', displayName: 'Linkable' });

    const alreadyLinked = group.collection('members').doc();
    const someUser = db.collection('users').doc();
    await alreadyLinked.set({
      userRef: someUser,
      email: 'already@example.com',
      displayName: 'Already Linked',
    });

    const result = await repairOrphanedMembersInternal(db, [
      linkable.path,
      alreadyLinked.path,
    ]);

    expect(result.linkedCount).toBe(1);

    const linkableDoc = await linkable.get();
    expect((linkableDoc.data()!['userRef'] as DocumentReference).id).toBe(matchedUser.id);

    const alreadyLinkedDoc = await alreadyLinked.get();
    expect((alreadyLinkedDoc.data()!['userRef'] as DocumentReference).id).toBe(someUser.id);
  });
});
