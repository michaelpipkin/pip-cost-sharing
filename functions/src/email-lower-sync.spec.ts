import type { DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';
import { syncMemberEmailLower, syncUserEmailLower } from './index';
import { upsertVerifiedEmail } from './verified-emails';

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

// syncMemberEmailLower also links an unlinked row to the owner of its address
// in the verified-address index, when the write created the row or changed
// its email. The event's before is the row as it was (undefined data for a
// create) and its after is the row as the write left it.
describe('syncMemberEmailLower linking', () => {
  /** A snapshot of a row before the write, or of a create (no data). */
  function beforeSnap(data?: Record<string, unknown>) {
    return { exists: data !== undefined, data: () => data };
  }

  async function runWrite(
    ref: DocumentReference,
    before: Record<string, unknown> | undefined,
    after?: Awaited<ReturnType<DocumentReference['get']>>
  ) {
    await (syncMemberEmailLower as any).run({
      data: { before: beforeSnap(before), after: after ?? (await ref.get()) },
      params: { groupId: ref.parent.parent!.id, memberId: ref.id },
    });
    return ref.get();
  }

  async function ownedAddress(owner: string, address?: string) {
    const email = address ?? `${uniqueId('own')}@Example.com`;
    // The owner's account exists: a link to a deleted account is refused.
    await db.collection('users').doc(owner).set({ email });
    await upsertVerifiedEmail(db, email, owner, 'login');
    return email;
  }

  it('links a new row to the owner of its address', async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const row = await makeMember(await makeGroup(), { email });

    const snap = await runWrite(row, undefined);

    expect(snap.get('userRef').path).toBe(`users/${owner}`);
    expect(snap.get('emailLower')).toBe(email.toLowerCase());
  });

  it("links when an unlinked row's email changes to an owned address", async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const old = `${uniqueId('old')}@example.com`;
    const row = await makeMember(await makeGroup(), { email, emailLower: old });

    const snap = await runWrite(row, { email: old, emailLower: old, userRef: null });

    expect(snap.get('userRef').id).toBe(owner);
    expect(snap.get('emailLower')).toBe(email.toLowerCase());
  });

  it('links an address with / % + and capitals', async () => {
    const owner = uniqueId('owner');
    const tag = uniqueId('ann').toLowerCase();
    await ownedAddress(owner, `${tag}/B+c%d@Example.com`);
    const stored = `${tag}/b+c%d@example.com`;
    const row = await makeMember(await makeGroup(), { email: stored });

    const snap = await runWrite(row, undefined);

    expect(snap.get('userRef').id).toBe(owner);
    expect(snap.get('emailLower')).toBe(stored);
  });

  it('does not link on an unlink', async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const row = await makeMember(await makeGroup(), { email });

    const snap = await runWrite(row, {
      email,
      userRef: db.doc(`users/${owner}`),
    });

    expect(snap.get('userRef')).toBeNull();
  });

  it('does not link without an index entry', async () => {
    const row = await makeMember(await makeGroup(), {
      email: `${uniqueId('nobody')}@example.com`,
    });

    const snap = await runWrite(row, undefined);

    expect(snap.get('userRef')).toBeNull();
    // emailLower is still kept in step when no link is made.
    expect(snap.get('emailLower')).toBe(snap.get('email'));
  });

  it('does not link a row whose email is blank', async () => {
    const row = await makeMember(await makeGroup(), { email: '   ' });

    const snap = await runWrite(row, undefined);

    expect(snap.get('userRef')).toBeNull();
  });

  it('does not link a second row for an account already in the group', async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const group = await makeGroup();
    const existing = await makeMember(group, {
      email: `${uniqueId('first')}@example.com`,
      userRef: db.doc(`users/${owner}`),
    });
    const row = await makeMember(group, { email });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const snap = await runWrite(row, undefined);

    expect(snap.get('userRef')).toBeNull();
    expect(snap.get('emailLower')).toBe(email.toLowerCase());
    expect((await existing.get()).get('userRef').id).toBe(owner);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls[0]!.join(' ');
    expect(logged).toContain(row.path);
    expect(logged).toContain(owner);
    expect(logged.toLowerCase()).not.toContain(email.toLowerCase());
  });

  it('links only one of two rows created at once for the same account', async () => {
    const owner = uniqueId('owner');
    const first = await ownedAddress(owner);
    const second = await ownedAddress(owner);
    const group = await makeGroup();
    const rowA = await makeMember(group, { email: first });
    const rowB = await makeMember(group, { email: second });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const [snapA, snapB] = await Promise.all([
      runWrite(rowA, undefined),
      runWrite(rowB, undefined),
    ]);

    const linked = [snapA, snapB].filter((s) => s.get('userRef') !== null);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.get('userRef').id).toBe(owner);
  });

  it('does not link when the email changed again before the trigger ran', async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const old = `${uniqueId('old')}@example.com`;
    const row = await makeMember(await makeGroup(), { email });
    const after = await row.get();
    await row.update({ email: `${uniqueId('later')}@example.com` });

    const snap = await runWrite(row, { email: old, userRef: null }, after);

    expect(snap.get('userRef')).toBeNull();
  });

  it('writes no emailLower from stale event data', async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const later = `${uniqueId('later')}@example.com`;
    const row = await makeMember(await makeGroup(), { email });
    const after = await row.get();
    await row.update({ email: later });

    const snap = await runWrite(row, undefined, after);

    // The stale email must not become emailLower; the later write's own
    // trigger keeps it right.
    expect(snap.get('userRef')).toBeNull();
    expect(snap.data()).not.toHaveProperty('emailLower');
  });

  it('does not throw for a stale event on a deleted row', async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const row = await makeMember(await makeGroup(), { email });
    const after = await row.get();
    await row.delete();

    await expect(runWrite(row, undefined, after)).resolves.toBeDefined();

    expect((await row.get()).exists).toBe(false);
  });

  it('still writes emailLower when the link step throws', async () => {
    const owner = uniqueId('owner');
    const email = await ownedAddress(owner);
    const row = await makeMember(await makeGroup(), { email });
    vi.spyOn(db, 'runTransaction').mockRejectedValue(new Error('firestore down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const snap = await runWrite(row, undefined);

    expect(snap.get('userRef')).toBeNull();
    expect(snap.get('emailLower')).toBe(email.toLowerCase());
    expect(error).toHaveBeenCalledTimes(1);
    const logged = error.mock.calls[0]!.join(' ');
    expect(logged).toContain(row.path);
    expect(logged.toLowerCase()).not.toContain(email.toLowerCase());
  });

  it('does not link to an account whose users doc is gone', async () => {
    const owner = uniqueId('owner');
    const email = `${uniqueId('ghost')}@Example.com`;
    // An index entry that outlived the account (no users/{owner} doc).
    await upsertVerifiedEmail(db, email, owner, 'login');
    const row = await makeMember(await makeGroup(), { email });

    const snap = await runWrite(row, undefined);

    expect(snap.get('userRef')).toBeNull();
    expect(snap.get('emailLower')).toBe(email.toLowerCase());
  });
});
