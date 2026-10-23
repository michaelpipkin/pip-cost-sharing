import type { DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { clearDefaultsOnGroupDeactivate, isGroupDeactivation } from './index';
import { makeGroup, uniqueId } from './test-fixtures';

const db = getFirestore();

describe('isGroupDeactivation', () => {
  it('is true when active goes from true to false', () => {
    expect(isGroupDeactivation({ active: true }, { active: false })).toBe(true);
  });

  it('is true when active goes from missing to false', () => {
    expect(isGroupDeactivation({}, { active: false })).toBe(true);
  });

  it('is true when archived goes from false to true', () => {
    expect(isGroupDeactivation({ archived: false }, { archived: true })).toBe(true);
  });

  it('is true when archived goes from missing to true', () => {
    expect(isGroupDeactivation({}, { archived: true })).toBe(true);
  });

  it('is false when active stays false', () => {
    expect(isGroupDeactivation({ active: false }, { active: false })).toBe(false);
  });

  it('is false for a rename of an inactive group (RF 5)', () => {
    expect(
      isGroupDeactivation(
        { active: false, name: 'Old' },
        { active: false, name: 'New' }
      )
    ).toBe(false);
  });

  it('is false for a rename of an archived group (RF 5)', () => {
    expect(
      isGroupDeactivation(
        { archived: true, name: 'Old' },
        { archived: true, name: 'New' }
      )
    ).toBe(false);
  });

  it('is false when a group is unarchived or reactivated (RF 5)', () => {
    expect(isGroupDeactivation({ active: false }, { active: true })).toBe(false);
    expect(isGroupDeactivation({ archived: true }, { archived: false })).toBe(false);
  });

  it('is false for a memberUids-only change (RF 5)', () => {
    expect(
      isGroupDeactivation(
        { active: true, memberUids: ['a'] },
        { active: true, memberUids: ['a', 'b'] }
      )
    ).toBe(false);
    expect(
      isGroupDeactivation(
        { active: false, memberUids: ['a'] },
        { active: false, memberUids: ['a', 'b'] }
      )
    ).toBe(false);
  });
});

describe('clearDefaultsOnGroupDeactivate', () => {
  // The group's current doc is the "after"; "before" carries the supplied
  // pre-change data. The emulator set used here runs no triggers.
  async function run(
    groupRef: DocumentReference,
    beforeData: Record<string, unknown>,
    afterData: Record<string, unknown>
  ) {
    await groupRef.update(afterData);
    const after = await groupRef.get();
    const before = { data: () => beforeData, ref: groupRef, id: groupRef.id };
    await (clearDefaultsOnGroupDeactivate as any).run({
      data: { before, after },
      params: { groupId: groupRef.id },
    });
  }

  it("clears every default pointing at a deactivated group and leaves another group's alone", async () => {
    const groupRef = await makeGroup({ active: true });
    const otherGroupRef = await makeGroup({ active: true });
    const u1 = db.collection('users').doc(uniqueId('u'));
    const u2 = db.collection('users').doc(uniqueId('u'));
    const u3 = db.collection('users').doc(uniqueId('u'));
    await u1.set({ defaultGroupRef: groupRef });
    await u2.set({ defaultGroupRef: groupRef });
    await u3.set({ defaultGroupRef: otherGroupRef });

    await run(groupRef, { active: true }, { active: false });

    expect((await u1.get()).get('defaultGroupRef')).toBeNull();
    expect((await u2.get()).get('defaultGroupRef')).toBeNull();
    expect((await u3.get()).get('defaultGroupRef').isEqual(otherGroupRef)).toBe(true);
  });

  it('clears defaults when a group is archived', async () => {
    const groupRef = await makeGroup({ archived: false });
    const u1 = db.collection('users').doc(uniqueId('u'));
    await u1.set({ defaultGroupRef: groupRef });

    await run(groupRef, { archived: false }, { archived: true });

    expect((await u1.get()).get('defaultGroupRef')).toBeNull();
  });

  it('does not clear anything for a memberUids-only update (RF 5)', async () => {
    const groupRef = await makeGroup({ active: false });
    const u1 = db.collection('users').doc(uniqueId('u'));
    await u1.set({ defaultGroupRef: groupRef });

    await run(groupRef, { active: false, memberUids: [] }, { memberUids: ['x'] });

    expect((await u1.get()).get('defaultGroupRef').isEqual(groupRef)).toBe(true);
  });

  it('does not clear anything when an inactive group is unarchived', async () => {
    const groupRef = await makeGroup({ archived: true });
    const u1 = db.collection('users').doc(uniqueId('u'));
    await u1.set({ defaultGroupRef: groupRef });

    await run(groupRef, { archived: true }, { archived: false });

    expect((await u1.get()).get('defaultGroupRef').isEqual(groupRef)).toBe(true);
  });
});
