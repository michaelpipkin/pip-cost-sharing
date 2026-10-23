// The backfill-verified-emails decisions (scripts/db/verified-email-backfill.ts):
// which Auth accounts seed a verifiedEmails entry, which are skipped, and which
// collide with an existing owner. Pure functions, so no emulator is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planUnlinkedMembersWithOwner,
  planVerifiedEmailBackfill,
} from './verified-email-backfill.ts';

const NON_USER = new Set(['play_review@google.com']);

test('planVerifiedEmailBackfill skips unverified, email-less and non-user accounts', () => {
  const plan = planVerifiedEmailBackfill(
    [
      { uid: 'u1', email: 'a@x.com', emailVerified: false },
      { uid: 'u2', email: undefined, emailVerified: true },
      { uid: 'u3', email: '', emailVerified: true },
      { uid: 'u4', email: 'Play_Review@Google.com', emailVerified: true },
    ],
    new Map(),
    NON_USER
  );
  assert.deepEqual(plan, { create: [], skip: 0, conflicts: [] });
});

test('planVerifiedEmailBackfill creates an entry, keyed by verifiedEmailId, for an address with none', () => {
  const plan = planVerifiedEmailBackfill(
    [{ uid: 'u1', email: 'Ann/B+c%d@Example.com', emailVerified: true }],
    new Map(),
    NON_USER
  );
  assert.deepEqual(plan.create, [
    { id: 'ann%2Fb+c%25d@example.com', email: 'ann/b+c%d@example.com', uid: 'u1' },
  ]);
  assert.equal(plan.skip, 0);
  assert.deepEqual(plan.conflicts, []);
});

test('planVerifiedEmailBackfill skips an address its own uid already owns', () => {
  const plan = planVerifiedEmailBackfill(
    [{ uid: 'u1', email: 'A@x.com', emailVerified: true }],
    new Map([['a@x.com', 'u1']]),
    NON_USER
  );
  assert.deepEqual(plan, { create: [], skip: 1, conflicts: [] });
});

test('planVerifiedEmailBackfill reports another uid as a conflict and never plans it for create', () => {
  const plan = planVerifiedEmailBackfill(
    [{ uid: 'u1', email: 'a@x.com', emailVerified: true }],
    new Map([['a@x.com', 'other']]),
    NON_USER
  );
  assert.deepEqual(plan.create, []);
  assert.equal(plan.skip, 0);
  assert.deepEqual(plan.conflicts, [
    { email: 'a@x.com', uid: 'u1', ownerUid: 'other' },
  ]);
});

test('planVerifiedEmailBackfill maps mixed casing and padding of one address to one id', () => {
  const plan = planVerifiedEmailBackfill(
    [
      { uid: 'u1', email: ' MiXed@X.com ', emailVerified: true },
      { uid: 'u2', email: 'other@x.com', emailVerified: true },
    ],
    new Map([['mixed@x.com', 'u1']]),
    NON_USER
  );
  assert.equal(plan.skip, 1);
  assert.deepEqual(plan.create.map((c) => c.id), ['other@x.com']);
});

test('planVerifiedEmailBackfill never plans one address twice within a run', () => {
  const plan = planVerifiedEmailBackfill(
    [
      { uid: 'u1', email: 'dup@x.com', emailVerified: true },
      { uid: 'u2', email: 'DUP@x.com', emailVerified: true },
      { uid: 'u1', email: 'dup@x.com', emailVerified: true },
    ],
    new Map(),
    NON_USER
  );
  assert.deepEqual(plan.create, [
    { id: 'dup@x.com', email: 'dup@x.com', uid: 'u1' },
  ]);
  assert.equal(plan.skip, 1);
  assert.deepEqual(plan.conflicts, [
    { email: 'dup@x.com', uid: 'u2', ownerUid: 'u1' },
  ]);
});

test('planUnlinkedMembersWithOwner lists unlinked rows whose address has an owner, planned or existing', () => {
  const owners = new Map([['has@x.com', 'u1']]);
  const plan = { create: [{ id: 'new@x.com', email: 'new@x.com', uid: 'u2' }], skip: 0, conflicts: [] };
  const rows = planUnlinkedMembersWithOwner(
    [
      { path: 'groups/g/members/m1', email: 'Has@X.com' },
      { path: 'groups/g/members/m2', email: 'new@x.com' },
      { path: 'groups/g/members/m3', email: 'nobody@x.com' },
      { path: 'groups/g/members/m4', email: '' },
      { path: 'groups/g/members/m5', email: undefined },
    ],
    owners,
    plan
  );
  assert.deepEqual(rows, [
    { memberPath: 'groups/g/members/m1', email: 'Has@X.com', ownerUid: 'u1' },
    { memberPath: 'groups/g/members/m2', email: 'new@x.com', ownerUid: 'u2' },
  ]);
});
