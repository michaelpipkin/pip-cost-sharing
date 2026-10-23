import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { ADMIN_UID_EMU } from './common';
// index.ts initialises the Admin SDK (the callables below need it).
import './index';
import {
  backfillOrphanedRegistrations,
  repairOrphanedMembers,
  runAdminReport,
  type AdminReportId,
} from './admin-reports';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';
import { upsertVerifiedEmail } from './verified-emails';

const db = getFirestore();

function asRequest(uid: string | null, data: unknown) {
  return { auth: uid ? { uid, token: {} } : undefined, data } as any;
}

const runReport = (uid: string | null, data: unknown) =>
  Promise.resolve(runAdminReport.run(asRequest(uid, data)));
const repair = (uid: string | null, data: unknown) =>
  Promise.resolve(repairOrphanedMembers.run(asRequest(uid, data)));
const backfill = (uid: string | null, data: unknown) =>
  Promise.resolve(backfillOrphanedRegistrations.run(asRequest(uid, data)));

const MEMBER_PATH = (n: number) => `groups/g-${n}/members/m-${n}`;

describe('runAdminReport', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(runReport(null, { reportId: 'overview' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses a signed-in user who is not the admin', async () => {
    await expect(
      runReport(uniqueId('u'), { reportId: 'overview' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('checks the admin before it looks at the reportId', async () => {
    await expect(runReport(uniqueId('u'), { reportId: 'nope' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it.each([
    ['an unknown id', { reportId: 'nope' }],
    ['a missing id', {}],
    ['no data at all', undefined],
    ['a non-string id', { reportId: 7 }],
  ])('rejects %s as invalid-argument "Unknown reportId"', async (_label, data) => {
    await expect(runReport(ADMIN_UID_EMU, data)).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('Unknown reportId'),
    });
  });

  it.each<AdminReportId>([
    'overview',
    'active-groups',
    'users',
    'orphaned-members',
    'orphaned-registrations',
    'duplicate-users',
    'expense-activity',
  ])('runs the %s report for the admin', async (reportId) => {
    const result = await runReport(ADMIN_UID_EMU, { reportId });

    expect(result.reportId).toBe(reportId);
    expect(result.title.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

describe('repairOrphanedMembers: guards', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(repair(null, { memberPaths: [MEMBER_PATH(1)] })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses a non-admin before it validates the input', async () => {
    await expect(repair(uniqueId('u'), { memberPaths: [] })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses a non-admin and links nothing', async () => {
    const email = `${uniqueId('repair')}@repair.test`;
    await db.collection('users').doc(uniqueId('u')).set({ emailLower: email });
    const member = await makeMember(await makeGroup(), { email });

    await expect(
      repair(uniqueId('u'), { memberPaths: [member.path] })
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect((await member.get()).data()?.['userRef']).toBeNull();
  });

  it.each([
    ['an empty array', { memberPaths: [] }],
    ['a string', { memberPaths: MEMBER_PATH(1) }],
    ['an object', { memberPaths: { 0: MEMBER_PATH(1) } }],
    ['null', { memberPaths: null }],
    ['a missing list', {}],
    ['no data at all', undefined],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    await expect(repair(ADMIN_UID_EMU, data)).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'memberPaths must be a non-empty array',
    });
  });

  it('rejects 501 targets with "Too many targets (max 500)"', async () => {
    const memberPaths = Array.from({ length: 501 }, (_, i) => MEMBER_PATH(i));

    await expect(repair(ADMIN_UID_EMU, { memberPaths })).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Too many targets (max 500)',
    });
  });

  it('accepts exactly 500 targets', async () => {
    const memberPaths = Array.from({ length: 500 }, (_, i) => MEMBER_PATH(i));

    // None of these documents exist, so nothing links, but the call is accepted.
    await expect(repair(ADMIN_UID_EMU, { memberPaths })).resolves.toEqual({
      linkedCount: 0,
    });
  });

  it.each([
    ['a user document path', 'users/abc'],
    ['a collection path', 'groups/g1/members'],
    ['a deeper path', 'groups/g1/members/m1/extra'],
    ['an empty group segment', 'groups//members/m1'],
    ['an expense path', 'groups/g1/expenses/e1'],
    ['an empty string', ''],
    ['a non-string', 5],
  ])('rejects %s as invalid-argument', async (_label, bad) => {
    await expect(
      repair(ADMIN_UID_EMU, { memberPaths: [MEMBER_PATH(1), bad] })
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'memberPaths must be group member document paths',
    });
  });

  it('rejects the whole call when one path is bad, linking none of the good ones', async () => {
    const email = `${uniqueId('partial')}@repair.test`;
    await db.collection('users').doc(uniqueId('u')).set({ emailLower: email });
    const member = await makeMember(await makeGroup(), { email });

    await expect(
      repair(ADMIN_UID_EMU, { memberPaths: [member.path, 'users/abc'] })
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect((await member.get()).data()?.['userRef']).toBeNull();
  });
});

describe('repairOrphanedMembers: a valid call', () => {
  it('links the member whose address has an owner and returns the linked count', async () => {
    const email = `${uniqueId('ok')}@repair.test`;
    const user = db.collection('users').doc(uniqueId('u'));
    await upsertVerifiedEmail(db, email, user.id, 'login');
    const group = await makeGroup();
    const linkable = await makeMember(group, { email });
    const noMatch = await makeMember(group, { email: `${uniqueId('none')}@repair.test` });

    const result = await repair(ADMIN_UID_EMU, {
      memberPaths: [linkable.path, noMatch.path],
    });

    expect(result).toEqual({ linkedCount: 1 });
    expect((await linkable.get()).data()?.['userRef'].path).toBe(user.path);
    expect((await noMatch.get()).data()?.['userRef']).toBeNull();
  });
});

describe('backfillOrphanedRegistrations: guards', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(backfill(null, { uids: ['u1'] })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses a non-admin before it validates the input', async () => {
    await expect(backfill(uniqueId('u'), { uids: [] })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses a non-admin and creates no profile', async () => {
    const user = await getAuth().createUser({ email: `${uniqueId('bf')}@backfill.test` });

    await expect(backfill(uniqueId('u'), { uids: [user.uid] })).rejects.toMatchObject({
      code: 'permission-denied',
    });

    expect((await db.collection('users').doc(user.uid).get()).exists).toBe(false);
  });

  it.each([
    ['an empty array', { uids: [] }],
    ['a string', { uids: 'abc' }],
    ['an object', { uids: { 0: 'abc' } }],
    ['null', { uids: null }],
    ['a missing list', {}],
    ['no data at all', undefined],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    await expect(backfill(ADMIN_UID_EMU, data)).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'uids must be a non-empty array',
    });
  });

  it('rejects 501 targets with "Too many targets (max 500)"', async () => {
    const uids = Array.from({ length: 501 }, (_, i) => `uid-${i}`);

    await expect(backfill(ADMIN_UID_EMU, { uids })).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Too many targets (max 500)',
    });
  });

  it('accepts exactly 500 targets', async () => {
    const uids = Array.from({ length: 500 }, () => uniqueId('ghost'));

    // None of these uids exist in Auth, so nothing is created.
    await expect(backfill(ADMIN_UID_EMU, { uids })).resolves.toEqual({
      createdCount: 0,
    });
  });

  it.each([
    ['an empty string', ''],
    ['a number', 5],
    ['null', null],
    ['an object', { uid: 'x' }],
  ])('rejects %s among the uids as invalid-argument', async (_label, bad) => {
    await expect(backfill(ADMIN_UID_EMU, { uids: ['u1', bad] })).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'uids must be non-empty strings',
    });
  });

  it('rejects the whole call when one uid is bad, creating no profile', async () => {
    const user = await getAuth().createUser({
      email: `${uniqueId('bfpartial')}@backfill.test`,
    });

    await expect(
      backfill(ADMIN_UID_EMU, { uids: [user.uid, ''] })
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect((await db.collection('users').doc(user.uid).get()).exists).toBe(false);
  });
});

describe('backfillOrphanedRegistrations: a valid call', () => {
  it('creates the profile for a real Auth user and returns the created count', async () => {
    const real = await getAuth().createUser({
      email: `${uniqueId('bfok')}@backfill.test`,
      emailVerified: true,
    });
    const ghost = uniqueId('ghost');

    const result = await backfill(ADMIN_UID_EMU, { uids: [real.uid, ghost] });

    expect(result).toEqual({ createdCount: 1 });
    expect((await db.collection('users').doc(real.uid).get()).exists).toBe(true);
    expect((await db.collection('users').doc(ghost).get()).exists).toBe(false);
  });
});
