import type {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  aggregateGroupStats,
  buildThirtyDaysAgoIso,
  getAdminExcludedGroupIds,
  getGroupStats,
  summarizeGroups,
} from './index';

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

    const excluded = await getAdminExcludedGroupIds(adminUserRef);

    expect(excluded.has(groupWithActiveAdmin.id)).toBe(true);
    expect(excluded.has(groupWithInactiveAdmin.id)).toBe(false);
    expect(excluded.has(groupWithoutAdmin.id)).toBe(false);
  });
});

function fakeGroupDoc(
  id: string,
  data: DocumentData
): QueryDocumentSnapshot {
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
      {
        totalMembers: 3,
        activeMembers: 2,
        hasExpenses: true,
        recentExpenses: 1,
      },
      {
        totalMembers: 1,
        activeMembers: 1,
        hasExpenses: false,
        recentExpenses: 0,
      },
      {
        totalMembers: 5,
        activeMembers: 3,
        hasExpenses: true,
        recentExpenses: 2,
      },
    ]);

    expect(result.totalMembers).toBe(9);
    expect(result.totalActiveMembers).toBe(6);
    expect(result.activeGroupsWithMultipleMembers).toBe(2);
    expect(result.activeGroupsWithExpenses).toBe(2);
    expect(result.groupsWithRecentActivity).toBe(2);
    expect(result.expensesCreatedLast30Days).toBe(3);
  });
});
