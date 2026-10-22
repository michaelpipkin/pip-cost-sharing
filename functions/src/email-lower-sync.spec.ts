import type { DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';
import { syncMemberEmailLower, syncUserEmailLower } from './index';

const db = getFirestore();

// These triggers are driven through .run() with the snapshot a real write
// would deliver; the emulator set used here runs no triggers, so a doc stays
// exactly as the trigger leaves it. A "write" is detected by spying on the
// snapshot ref's update(): the emulator skips a no-op update without bumping
// updateTime, so updateTime alone cannot show that a loop-causing write was
// attempted.

interface Target {
  name: string;
  run: (event: unknown) => Promise<unknown> | unknown;
  create: (fields: Record<string, unknown>) => Promise<DocumentReference>;
  params: (ref: DocumentReference) => Record<string, string>;
}

const targets: Target[] = [
  {
    name: 'syncUserEmailLower',
    run: (event) => (syncUserEmailLower as any).run(event),
    create: async (fields) => {
      const ref = db.collection('users').doc(uniqueId('u'));
      await ref.set(fields);
      return ref;
    },
    params: (ref) => ({ userId: ref.id }),
  },
  {
    name: 'syncMemberEmailLower',
    run: (event) => (syncMemberEmailLower as any).run(event),
    create: async (fields) => makeMember(await makeGroup(), fields),
    params: (ref) => ({ groupId: ref.parent.parent!.id, memberId: ref.id }),
  },
];

afterEach(() => vi.restoreAllMocks());

describe.each(targets)('$name', (target) => {
  let update: any;

  async function written(ref: DocumentReference) {
    const after = await ref.get();
    const before = after; // before is never read by the triggers
    update = vi.spyOn(after.ref, 'update');
    await target.run({ data: { before, after }, params: target.params(ref) });
    return ref.get();
  }

  it('writes the lowercased email as emailLower', async () => {
    const n = uniqueId('alice');
    const ref = await target.create({ email: `${n}@Example.COM` });

    const snap = await written(ref);

    expect(snap.get('emailLower')).toBe(`${n}@example.com`);
    expect(snap.get('email')).toBe(`${n}@Example.COM`);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('trims surrounding whitespace when lowercasing', async () => {
    const n = uniqueId('bob');
    const ref = await target.create({ email: `  ${n}@Example.com ` });

    expect((await written(ref)).get('emailLower')).toBe(`${n}@example.com`);
  });

  it('corrects a stale emailLower that no longer matches the email', async () => {
    const n = uniqueId('new');
    const ref = await target.create({
      email: `${n}@Example.com`,
      emailLower: `old-${n}@example.com`,
    });

    expect((await written(ref)).get('emailLower')).toBe(`${n}@example.com`);
  });

  it('does not write when emailLower already matches, so its own write cannot loop', async () => {
    const n = uniqueId('carol');
    const ref = await target.create({
      email: `${n}@Example.com`,
      emailLower: `${n}@example.com`,
    });
    const updateTime = (await ref.get()).updateTime!;

    const snap = await written(ref);

    expect(update).not.toHaveBeenCalled();
    expect(snap.updateTime!.isEqual(updateTime)).toBe(true);
  });

  it('does not write for a blank email with no emailLower', async () => {
    const ref = await target.create({ email: '' });
    const updateTime = (await ref.get()).updateTime!;

    const snap = await written(ref);

    expect(update).not.toHaveBeenCalled();
    expect(snap.updateTime!.isEqual(updateTime)).toBe(true);
    expect(snap.data()).not.toHaveProperty('emailLower');
  });

  it('deletes a stale emailLower when the email is blank', async () => {
    const ref = await target.create({
      email: '',
      emailLower: `${uniqueId('gone')}@example.com`,
    });

    const snap = await written(ref);

    expect(snap.data()).not.toHaveProperty('emailLower');
    expect(snap.get('email')).toBe('');
  });

  it('deletes a stale emailLower when the email field is missing', async () => {
    const ref = await target.create({
      emailLower: `${uniqueId('gone')}@example.com`,
    });

    expect((await written(ref)).data()).not.toHaveProperty('emailLower');
  });

  it('does nothing when the document was deleted', async () => {
    const email = `${uniqueId('dave')}@Example.com`;
    const ref = await target.create({ email });
    const real = await ref.get();
    // The event for a delete carries a snapshot that does not exist. It is
    // pointed at a live doc, and still reports data that would need a write,
    // so only the exists check stops the trigger from writing.
    const deleted = {
      exists: false,
      ref,
      data: () => ({ email }),
    };
    const spy = vi.spyOn(ref, 'update');

    await target.run({
      data: { before: real, after: deleted },
      params: target.params(ref),
    });

    expect(spy).not.toHaveBeenCalled();
    const snap = await ref.get();
    expect(snap.data()).not.toHaveProperty('emailLower');
    expect(snap.updateTime!.isEqual(real.updateTime!)).toBe(true);
  });

  it('does nothing when the event carries no data', async () => {
    const ref = await target.create({ email: `${uniqueId('eve')}@Example.com` });
    const updateTime = (await ref.get()).updateTime!;

    await expect(
      target.run({ data: undefined, params: target.params(ref) })
    ).resolves.toBeUndefined();

    expect((await ref.get()).updateTime!.isEqual(updateTime)).toBe(true);
  });
});
