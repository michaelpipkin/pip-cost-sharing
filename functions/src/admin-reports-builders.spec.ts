import { getAuth, type Auth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { ADMIN_UID_EMU } from './common';
// index.ts initialises the Admin SDK (the builders below need it).
import './index';
import {
  backfillOrphanedRegistrationsInternal,
  buildDaysAgoIso,
  buildDuplicateUsersReport,
  buildExpenseActivityReport,
  buildOrphanedRegistrationsReport,
  buildOverviewReport,
  buildUsersReport,
  repairOrphanedMembersInternal,
  type AdminReportResult,
} from './admin-reports';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

// The builders count across the whole shared emulator, so the report-level
// tests either take a report before and after creating their own data and
// assert on the difference, or look only at table rows carrying their own
// uids/emails. The pure-logic cases (Never signed in, "(no email)", the
// 25-row cap, duplicate emails) feed the builder a stub Auth, so they are
// deterministic whatever else is in the emulator.

const db = getFirestore();

const DAY_MS = 24 * 60 * 60 * 1000;

function stat(report: AdminReportResult, section: string, label: string) {
  const found = report.summary
    .find((s) => s.title === section)
    ?.stats.find((s) => s.label === label);
  if (found === undefined) {
    throw new Error(`No stat "${label}" in section "${section}"`);
  }
  return found.value as number;
}

interface StubUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  createdMs?: number;
  lastSignInMs?: number | null;
  /** Overrides createdMs when a test needs an exact RFC 1123 string. */
  createdString?: string;
  providers?: string[];
}

function stubAuth(pages: StubUser[][]): Auth {
  const records = pages.map((page) =>
    page.map(
      (u) =>
        ({
          uid: u.uid,
          email: u.email,
          emailVerified: u.emailVerified ?? false,
          metadata: {
            creationTime:
              u.createdString ?? new Date(u.createdMs ?? Date.now()).toUTCString(),
            lastSignInTime:
              u.lastSignInMs == null ? undefined : new Date(u.lastSignInMs).toUTCString(),
          },
          providerData: (u.providers ?? []).map((providerId) => ({ providerId })),
        }) as unknown as UserRecord
    )
  );
  return {
    listUsers: async (_max?: number, pageToken?: string) => {
      const index = pageToken ? Number(pageToken) : 0;
      return {
        users: records[index] ?? [],
        pageToken: index + 1 < records.length ? String(index + 1) : undefined,
      };
    },
  } as unknown as Auth;
}

describe('buildOverviewReport', () => {
  it('moves each count by exactly the data this test adds', async () => {
    // Total Users never goes below zero, so make sure the baseline is above it
    // (a run of this file alone starts with an empty users collection).
    for (let i = 0; i < 2; i++) {
      await db.collection('users').doc(uniqueId('u')).set({ email: '' });
    }
    const before = await buildOverviewReport(db, ADMIN_UID_EMU);

    // Counted: active, not archived, 3 members (2 active), one expense today.
    const busy = await makeGroup({ active: true, archived: false });
    await makeMember(busy, { active: true });
    await makeMember(busy, { active: true });
    await makeMember(busy, { active: false });
    await busy.collection('expenses').doc(uniqueId('e')).set({ date: buildDaysAgoIso(0) });
    // Active but with a single member and no expenses.
    const quiet = await makeGroup({ active: true, archived: false });
    await makeMember(quiet, { active: true });
    // Counted in the total only: archived, and inactive.
    const archived = await makeGroup({ active: true, archived: true });
    await makeMember(archived, { active: true });
    await makeMember(archived, { active: true });
    const inactive = await makeGroup({ active: false, archived: false });
    await makeMember(inactive, { active: true });
    // The admin's own group is excluded from every group and member count.
    const adminGroup = await makeGroup({ active: true, archived: false });
    await makeMember(adminGroup, {
      active: true,
      userRef: db.collection('users').doc(ADMIN_UID_EMU),
    });
    await makeMember(adminGroup, { active: true });
    await adminGroup.collection('expenses').doc(uniqueId('e')).set({
      date: buildDaysAgoIso(0),
    });
    // Three user documents.
    for (let i = 0; i < 3; i++) {
      await db.collection('users').doc(uniqueId('u')).set({ email: '' });
    }

    const after = await buildOverviewReport(db, ADMIN_UID_EMU);
    const delta = (section: string, label: string) =>
      stat(after, section, label) - stat(before, section, label);

    expect(after.reportId).toBe('overview');
    expect(delta('Groups', 'Total Groups')).toBe(4);
    expect(delta('Groups', 'Active Groups')).toBe(2);
    expect(delta('Groups', 'Active with 2+ Members')).toBe(1);
    expect(delta('Groups', 'Active with Expenses')).toBe(1);
    expect(delta('Users & Members', 'Total Users')).toBe(3);
    expect(delta('Users & Members', 'Total Members')).toBe(4);
    expect(delta('Users & Members', 'Active Members')).toBe(3);
    expect(delta('Recent Activity (30 days)', 'Groups with Activity')).toBe(1);
    expect(delta('Recent Activity (30 days)', 'Expenses Created')).toBe(1);
  });

  it('reports the average members per active group to two decimal places', async () => {
    // Three active members across two groups gives 1.5, and one more active
    // member in a third group keeps the global ratio from being a round
    // number whatever else is in the emulator.
    const a = await makeGroup({ active: true, archived: false });
    await makeMember(a);
    const b = await makeGroup({ active: true, archived: false });
    await makeMember(b);
    await makeMember(b);
    const c = await makeGroup({ active: true, archived: false });
    await makeMember(c);

    // The emulator is shared, so keep adding small groups until the global
    // ratio is not already a two-decimal number; otherwise rounding is a no-op
    // and this test could not tell a rounded value from a raw one.
    const read = async () => {
      const report = await buildOverviewReport(db, ADMIN_UID_EMU);
      const members = stat(report, 'Users & Members', 'Active Members');
      const groups = stat(report, 'Groups', 'Active Groups');
      return {
        groups,
        raw: members / groups,
        average: stat(report, 'Users & Members', 'Avg Members/Active Group'),
      };
    };
    let seen = await read();
    for (let i = 0; i < 10 && Math.abs(seen.raw * 100 - Math.round(seen.raw * 100)) < 1e-6; i++) {
      const extra = await makeGroup({ active: true, archived: false });
      for (let m = 0; m <= i % 3; m++) await makeMember(extra);
      seen = await read();
    }

    expect(seen.groups).toBeGreaterThanOrEqual(3);
    expect(Math.abs(seen.raw * 100 - Math.round(seen.raw * 100))).toBeGreaterThan(1e-6);
    expect(seen.average).toBe(Math.round(seen.raw * 100) / 100);
    expect(seen.average).not.toBe(seen.raw);
  });

  it("subtracts the admin's own account from Total Users when it has a user doc", async () => {
    const adminDoc = db.collection('users').doc(ADMIN_UID_EMU);
    const previous = await adminDoc.get();
    try {
      await adminDoc.set(previous.data() ?? { email: '' });
      const total = (await db.collection('users').count().get()).data().count;

      const report = await buildOverviewReport(db, ADMIN_UID_EMU);

      expect(stat(report, 'Users & Members', 'Total Users')).toBe(total - 1);
    } finally {
      if (!previous.exists) await adminDoc.delete();
    }
  });

  // BUG (B10): functions/src/admin-reports.ts:313 subtracts 1 for the admin's
  // own account even when the admin has no users doc, so Total Users is one
  // short; deferred by owner 2026-10-21
  it.fails('does not subtract 1 for the admin when the admin has no user doc', async () => {
    const adminDoc = db.collection('users').doc(ADMIN_UID_EMU);
    const previous = await adminDoc.get();
    // At least one other user, so a count of 0 can't hide the subtraction.
    await db.collection('users').doc(uniqueId('u')).set({ email: '' });
    try {
      if (previous.exists) await adminDoc.delete();
      const total = (await db.collection('users').count().get()).data().count;
      expect(total).toBeGreaterThan(0);

      const report = await buildOverviewReport(db, ADMIN_UID_EMU);

      expect(stat(report, 'Users & Members', 'Total Users')).toBe(total);
    } finally {
      if (previous.exists) await adminDoc.set(previous.data()!);
    }
  });
});

describe('buildUsersReport', () => {
  it('counts the users this test registers and lists them with their sign-in state', async () => {
    const auth = getAuth();
    const before = await buildUsersReport(auth);
    const tag = uniqueId('usr');
    const emails = [0, 1, 2].map((i) => `${tag}-${i}@users-report.test`);
    await auth.createUser({ email: emails[0]!, emailVerified: true });
    await auth.createUser({ email: emails[1]!, emailVerified: false });
    await auth.createUser({ email: emails[2]!, emailVerified: true });

    const after = await buildUsersReport(auth);
    const delta = (label: string) =>
      stat(after, 'Users', label) - stat(before, 'Users', label);

    expect(after.reportId).toBe('users');
    expect(delta('Total Users')).toBe(3);
    expect(delta('New in Last 30 Days')).toBe(3);
    // The Auth emulator stamps lastSignInTime at creation, so none are "never".
    expect(delta('Signed In in Last 30 Days')).toBe(3);
    expect(delta('Never Signed In')).toBe(0);

    const rows = after.tables[0]!.rows.filter((r) => emails.includes(r['email'] as string));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r['email'] === emails[0])?.['emailVerified']).toBe(true);
    expect(rows.find((r) => r['email'] === emails[1])?.['emailVerified']).toBe(false);
    for (const row of rows) {
      expect(Number.isNaN(Date.parse(row['created'] as string))).toBe(false);
      expect(row['lastSignIn']).not.toBe('Never');
    }
  });

  it('counts new and signed-in users against a 30-day cutoff, "Never", and skips the review account', async () => {
    const now = Date.now();
    const auth = stubAuth([
      [
        {
          uid: 'new-active',
          email: 'new-active@x.test',
          createdMs: now - 29 * DAY_MS,
          lastSignInMs: now - 1 * DAY_MS,
        },
        {
          uid: 'old-active',
          email: 'old-active@x.test',
          createdMs: now - 400 * DAY_MS,
          lastSignInMs: now - 29 * DAY_MS,
        },
        {
          uid: 'old-lapsed',
          email: 'old-lapsed@x.test',
          createdMs: now - 31 * DAY_MS,
          lastSignInMs: now - 31 * DAY_MS,
        },
        {
          uid: 'never',
          email: 'never@x.test',
          createdMs: now - 2 * DAY_MS,
          lastSignInMs: null,
        },
        {
          uid: 'no-email',
          createdMs: now - 3 * DAY_MS,
          lastSignInMs: now - 3 * DAY_MS,
        },
        {
          uid: 'review',
          email: 'Play_Review@Google.com',
          createdMs: now - 1 * DAY_MS,
          lastSignInMs: now - 1 * DAY_MS,
        },
      ],
    ]);

    const report = await buildUsersReport(auth);

    expect(stat(report, 'Users', 'Total Users')).toBe(5);
    expect(stat(report, 'Users', 'New in Last 30 Days')).toBe(3);
    expect(stat(report, 'Users', 'Signed In in Last 30 Days')).toBe(3);
    expect(stat(report, 'Users', 'Never Signed In')).toBe(1);

    const rows = report.tables[0]!.rows;
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r['email'])).not.toContain('Play_Review@Google.com');
    expect(rows.find((r) => r['email'] === 'never@x.test')?.['lastSignIn']).toBe('Never');
    expect(rows.some((r) => r['email'] === '(no email)')).toBe(true);
    expect(rows.find((r) => r['email'] === 'new-active@x.test')?.['lastSignIn']).not.toBe(
      'Never'
    );
  });

  it('lists only the newest 25 signups, newest first, across several Auth pages', async () => {
    const now = Date.now();
    const users = (offset: number, count: number): StubUser[] =>
      Array.from({ length: count }, (_, i) => ({
        uid: `u${offset + i}`,
        email: `u${offset + i}@x.test`,
        // u0 is the newest, then each next user is a day older.
        createdMs: now - (offset + i) * DAY_MS,
        lastSignInMs: now,
      }));
    // 30 users over two pages, the older ones on the second page.
    const auth = stubAuth([users(0, 12), users(12, 18)]);

    const report = await buildUsersReport(auth);

    expect(stat(report, 'Users', 'Total Users')).toBe(30);
    expect(report.tables[0]!.rows.map((r) => r['email'])).toEqual(
      Array.from({ length: 25 }, (_, i) => `u${i}@x.test`)
    );
  });

  it('shows an empty table when there are no users', async () => {
    const report = await buildUsersReport(stubAuth([[]]));

    expect(stat(report, 'Users', 'Total Users')).toBe(0);
    expect(report.tables[0]!.rows).toEqual([]);
    expect(report.tables[0]!.emptyMessage).toBe('No users found.');
  });
});

describe('buildOrphanedRegistrationsReport', () => {
  it('lists an Auth user with no users doc, skips one that has a doc, and skips the review account', async () => {
    const auth = getAuth();
    const before = await buildOrphanedRegistrationsReport(auth, db);
    const orphan = await auth.createUser({
      email: `${uniqueId('orph')}@orphans.test`,
      emailVerified: true,
    });
    const registered = await auth.createUser({
      email: `${uniqueId('reg')}@orphans.test`,
    });
    await db.collection('users').doc(registered.uid).set({ email: '' });
    // The Play review account is global; reuse it if another spec made it.
    let reviewUid: string | null = null;
    let createdReview = false;
    try {
      reviewUid = (await auth.getUserByEmail('play_review@google.com')).uid;
    } catch {
      reviewUid = (await auth.createUser({ email: 'play_review@google.com' })).uid;
      createdReview = true;
    }

    try {
      const after = await buildOrphanedRegistrationsReport(auth, db);
      const delta = (label: string) =>
        stat(after, 'Orphaned Registrations', label) -
        stat(before, 'Orphaned Registrations', label);

      expect(after.reportId).toBe('orphaned-registrations');
      // The orphan and the registered user count as Auth users; the review
      // account counts as neither.
      expect(delta('Total Auth Users')).toBe(2);
      expect(delta('Missing Firestore User Doc')).toBe(1);

      const rows = after.tables[0]!.rows;
      const orphanRow = rows.find((r) => r['uid'] === orphan.uid);
      expect(orphanRow).toMatchObject({
        uid: orphan.uid,
        email: orphan.email,
        emailVerified: true,
      });
      expect(Number.isNaN(Date.parse(orphanRow!['created'] as string))).toBe(false);
      expect(rows.some((r) => r['uid'] === registered.uid)).toBe(false);
      expect(rows.some((r) => r['uid'] === reviewUid)).toBe(false);
    } finally {
      if (createdReview && reviewUid) await auth.deleteUser(reviewUid);
    }
  });
});

describe('backfillOrphanedRegistrationsInternal', () => {
  it('creates the users doc with the default profile fields and the verified email', async () => {
    const auth = getAuth();
    const user = await auth.createUser({
      email: `${uniqueId('bf')}@backfill.test`,
      emailVerified: true,
    });

    const result = await backfillOrphanedRegistrationsInternal(db, auth, [user.uid]);

    expect(result).toEqual({ createdCount: 1 });
    expect((await db.collection('users').doc(user.uid).get()).data()).toEqual({
      email: user.email,
      defaultGroupRef: null,
      receiptPolicy: false,
      emailOptOut: false,
      venmoId: '',
      paypalId: '',
      cashAppId: '',
      zelleId: '',
    });
  });

  it('leaves an existing users doc untouched', async () => {
    const auth = getAuth();
    const user = await auth.createUser({
      email: `${uniqueId('bfkeep')}@backfill.test`,
      emailVerified: true,
    });
    const existing = {
      email: 'chosen@backfill.test',
      venmoId: 'my-venmo',
      receiptPolicy: true,
    };
    await db.collection('users').doc(user.uid).set(existing);

    const result = await backfillOrphanedRegistrationsInternal(db, auth, [user.uid]);

    expect(result).toEqual({ createdCount: 0 });
    expect((await db.collection('users').doc(user.uid).get()).data()).toEqual(existing);
  });

  it('skips a uid that is not in Auth and still creates the others', async () => {
    const auth = getAuth();
    const real = await auth.createUser({ email: `${uniqueId('bfreal')}@backfill.test` });
    const ghost = uniqueId('ghost');

    const result = await backfillOrphanedRegistrationsInternal(db, auth, [ghost, real.uid]);

    expect(result).toEqual({ createdCount: 1 });
    expect((await db.collection('users').doc(ghost).get()).exists).toBe(false);
    expect((await db.collection('users').doc(real.uid).get()).exists).toBe(true);
  });

  it('does nothing for an empty list', async () => {
    await expect(
      backfillOrphanedRegistrationsInternal(db, getAuth(), [])
    ).resolves.toEqual({ createdCount: 0 });
  });

  // BUG (B10): functions/src/admin-reports.ts:722-758 builds toCreate from the
  // raw uid list, so a repeated uid is created and counted twice; deferred by
  // owner 2026-10-21
  it.fails('counts a repeated uid once', async () => {
    const auth = getAuth();
    const user = await auth.createUser({ email: `${uniqueId('bfdup')}@backfill.test` });

    const result = await backfillOrphanedRegistrationsInternal(db, auth, [
      user.uid,
      user.uid,
    ]);

    expect(result.createdCount).toBe(1);
  });
});

describe('repairOrphanedMembersInternal: what it skips', () => {
  it('links only the member that still has no user and matches exactly one', async () => {
    const group = await makeGroup();
    const tag = uniqueId('skip');
    const single = `${tag}-single@repair.test`;
    const shared = `${tag}-shared@repair.test`;
    const singleUser = db.collection('users').doc(uniqueId('u'));
    await singleUser.set({ emailLower: single });
    await db.collection('users').doc(uniqueId('u')).set({ emailLower: shared });
    await db.collection('users').doc(uniqueId('u')).set({ emailLower: shared });

    const linkable = await makeMember(group, { email: single.toUpperCase() });
    const alreadyLinked = await makeMember(group, {
      email: single,
      userRef: db.collection('users').doc(uniqueId('other')),
    });
    const ambiguous = await makeMember(group, { email: shared });
    const placeholder = await makeMember(group, { email: '' });
    const noEmailField = await makeMember(group);
    const missing = group.collection('members').doc(uniqueId('gone'));

    const result = await repairOrphanedMembersInternal(db, [
      linkable.path,
      alreadyLinked.path,
      ambiguous.path,
      placeholder.path,
      noEmailField.path,
      missing.path,
    ]);

    expect(result).toEqual({ linkedCount: 1 });
    expect((await linkable.get()).data()?.['userRef'].path).toBe(singleUser.path);
    expect((await alreadyLinked.get()).data()?.['userRef'].path).not.toBe(singleUser.path);
    expect((await ambiguous.get()).data()?.['userRef']).toBeNull();
    expect((await placeholder.get()).data()?.['userRef']).toBeNull();
    expect((await noEmailField.get()).data()?.['userRef']).toBeNull();
    expect((await missing.get()).exists).toBe(false);
  });

  it('does nothing for an empty list', async () => {
    await expect(repairOrphanedMembersInternal(db, [])).resolves.toEqual({
      linkedCount: 0,
    });
  });
});

describe('repairOrphanedMembersInternal: repeated paths', () => {
  // B10: onePerGroupLinks keeps one link per group and user, so a repeated
  // path is linked and counted once.
  it('counts a repeated member path once', async () => {
    const email = `${uniqueId('rdup')}@repair.test`;
    await db.collection('users').doc(uniqueId('u')).set({ emailLower: email });
    const member = await makeMember(await makeGroup(), { email });

    const result = await repairOrphanedMembersInternal(db, [member.path, member.path]);

    expect(result.linkedCount).toBe(1);
  });
});

describe('buildDuplicateUsersReport', () => {
  // The Auth emulator lower-cases emails and refuses a second account whose
  // email differs only by case, so duplicates can't be created for real. The
  // empty-state test runs against the real emulator; the populated cases feed
  // the builder a stub Auth (the Firestore lookups stay real).
  it('reports no duplicates when the emulator refuses case-variant emails', async () => {
    const auth = getAuth();
    const email = `${uniqueId('Case')}@Dupes.test`;
    await auth.createUser({ email });

    await expect(auth.createUser({ email: email.toLowerCase() })).rejects.toMatchObject({
      code: 'auth/email-already-exists',
    });

    const report = await buildDuplicateUsersReport(auth, db);

    expect(report.reportId).toBe('duplicate-users');
    expect(stat(report, 'Duplicate User Accounts', 'Emails with Multiple Accounts')).toBe(0);
    expect(stat(report, 'Duplicate User Accounts', 'Affected Accounts')).toBe(0);
    expect(report.tables[0]!.rows).toEqual([]);
    expect(report.tables[0]!.emptyMessage).toBe('No duplicate accounts found.');
  });

  it('groups accounts whose emails differ only by case, with doc and member details', async () => {
    const tag = uniqueId('dup').toLowerCase();
    const first = { uid: uniqueId('d1'), email: `A-${tag}@Dupes.test` };
    const second = { uid: uniqueId('d2'), email: `a-${tag}@dupes.test` };
    const other = { uid: uniqueId('d3'), email: `B-${tag}@dupes.test` };
    const other2 = { uid: uniqueId('d4'), email: `b-${tag}@DUPES.test` };
    const unique = { uid: uniqueId('d5'), email: `solo-${tag}@dupes.test` };
    // Only the first account has a users doc, and one member links to it.
    await db.collection('users').doc(first.uid).set({ email: '' });
    const group = await makeGroup();
    await makeMember(group, { userRef: db.collection('users').doc(first.uid) });
    await makeMember(group, { userRef: db.collection('users').doc(first.uid) });
    const auth = stubAuth([
      [
        { ...first, createdMs: Date.now() - 5 * DAY_MS, providers: ['password'] },
        { uid: 'noemail', createdMs: Date.now() },
        { uid: 'rev1', email: 'play_review@google.com' },
      ],
      [
        { ...other2, createdMs: Date.now() - 1 * DAY_MS, lastSignInMs: null },
        { ...second, createdMs: Date.now() - 2 * DAY_MS, providers: ['google.com', 'password'] },
        { ...unique, createdMs: Date.now() },
        { uid: 'rev2', email: 'Play_Review@google.com' },
        { ...other, createdMs: Date.now() - 3 * DAY_MS },
      ],
    ]);

    const report = await buildDuplicateUsersReport(auth, db);
    const rows = report.tables[0]!.rows;

    expect(stat(report, 'Duplicate User Accounts', 'Emails with Multiple Accounts')).toBe(2);
    expect(stat(report, 'Duplicate User Accounts', 'Affected Accounts')).toBe(4);
    // Sorted by normalised email, so the "a-" group precedes the "b-" group.
    expect(rows.map((r) => r['email'])).toEqual([
      `a-${tag}@dupes.test`,
      `a-${tag}@dupes.test`,
      `b-${tag}@dupes.test`,
      `b-${tag}@dupes.test`,
    ]);
    expect(rows.map((r) => r['uid']).sort()).toEqual(
      [first.uid, second.uid, other.uid, other2.uid].sort()
    );

    const row = (uid: string) => rows.find((r) => r['uid'] === uid)!;
    expect(row(first.uid)).toMatchObject({
      hasUserDoc: true,
      linkedMemberCount: 2,
      providers: 'password',
    });
    expect(row(second.uid)).toMatchObject({
      hasUserDoc: false,
      linkedMemberCount: 0,
      providers: 'google.com, password',
    });
    expect(row(other2.uid)).toMatchObject({ lastSignIn: 'Never', providers: '(none)' });
  });

  // BUG (B10, deferred by owner 2026-10-21; folded in by ruling R14): functions/src/admin-reports.ts:818
  // breaks ties between a duplicate email's accounts by comparing their
  // creation times as RFC 1123 strings ("Thu, 22 Oct ..." < "Wed, 21 Oct
  // ..."), so the order follows the weekday name rather than the date
  it.fails('lists the accounts of one email oldest first', async () => {
    const tag = uniqueId('ord').toLowerCase();
    const older = { uid: uniqueId('o1'), email: `ord-${tag}@dupes.test` };
    const newer = { uid: uniqueId('o2'), email: `ord-${tag}@dupes.test` };
    // Fixed dates: Wednesday 21 Oct 2026 is older than Thursday 22 Oct 2026.
    const auth = stubAuth([
      [
        { ...newer, createdString: 'Thu, 22 Oct 2026 10:00:00 GMT' },
        { ...older, createdString: 'Wed, 21 Oct 2026 10:00:00 GMT' },
      ],
    ]);

    const report = await buildDuplicateUsersReport(auth, db);

    expect(report.tables[0]!.rows.map((r) => r['uid'])).toEqual([older.uid, newer.uid]);
  });
});

describe('buildExpenseActivityReport', () => {
  /** "October 2026"-style label for the month containing an ISO date. */
  function monthLabel(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y!, m! - 1, d!).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  it('moves the 7/30/90-day and per-month counts by exactly the expenses this test adds', async () => {
    const before = await buildExpenseActivityReport(db);
    const group = await makeGroup();
    const dates = [0, 7, 8, 40, 100].map(buildDaysAgoIso);
    for (const date of dates) {
      await group.collection('expenses').doc(uniqueId('e')).set({ date });
    }

    const after = await buildExpenseActivityReport(db);
    const delta = (label: string) =>
      stat(after, 'Expense Activity', label) - stat(before, 'Expense Activity', label);

    expect(after.reportId).toBe('expense-activity');
    expect(delta('Total Expenses')).toBe(5);
    expect(delta('Last 7 Days')).toBe(2); // today and exactly 7 days ago; not 8
    expect(delta('Last 30 Days')).toBe(3); // plus 8 days ago; not 40
    expect(delta('Last 90 Days')).toBe(4); // plus 40 days ago; not 100

    const expectedByMonth = new Map<string, number>();
    for (const date of dates) {
      expectedByMonth.set(monthLabel(date), (expectedByMonth.get(monthLabel(date)) ?? 0) + 1);
    }
    const countFor = (report: AdminReportResult, month: string) =>
      report.tables[0]!.rows.find((r) => r['month'] === month)!['count'] as number;
    for (const [month, added] of expectedByMonth) {
      expect(countFor(after, month) - countFor(before, month)).toBe(added);
    }
  });

  it('lists six months, newest first, starting with the current month', async () => {
    const report = await buildExpenseActivityReport(db);
    const now = new Date();
    const expectedLabels = Array.from({ length: 6 }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    );

    expect(report.tables[0]!.rows.map((r) => r['month'])).toEqual(expectedLabels);
    expect(new Set(expectedLabels).size).toBe(6);
    expect(report.tables[0]!.rows[0]!['month']).toBe(
      now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    );
  });
});
