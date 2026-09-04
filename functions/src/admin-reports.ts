import { Auth, getAuth, UserRecord } from 'firebase-admin/auth';
import {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  getFirestore,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  ADMIN_TEST_EMAILS_LOWER,
  assertAdmin,
  callableAppCheck,
  NON_USER_AUTH_EMAILS,
  normalizeEmail,
} from './common';

// getFirestore()/getAuth() are called lazily inside each handler/report
// builder rather than at module scope - this module is imported (and so
// evaluated) by index.ts before index.ts calls initializeApp(), mirroring
// the same constraint documented in receipt-ocr.ts and user-onboarding.ts.

// ---------------------------------------------------------------------------
// Shared report result shape
// ---------------------------------------------------------------------------

export type AdminReportId =
  | 'overview'
  | 'active-groups'
  | 'users'
  | 'orphaned-members'
  | 'orphaned-registrations'
  | 'duplicate-users'
  | 'expense-activity';

export interface AdminReportStat {
  label: string;
  value: string | number;
}

export interface AdminReportSection {
  title: string;
  stats: AdminReportStat[];
}

export interface AdminReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}

export type AdminReportRow = Record<string, string | number | boolean | null>;

export interface AdminReportTable {
  title: string;
  columns: AdminReportColumn[];
  rows: AdminReportRow[];
  emptyMessage?: string;
}

export interface AdminReportResult {
  reportId: AdminReportId;
  title: string;
  generatedAt: string;
  summary: AdminReportSection[];
  tables: AdminReportTable[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build a "YYYY-MM-DD" cutoff string `days` before today, local time.
 * Expense dates are stored as "YYYY-MM-DD" strings, so lexicographic
 * comparison with a same-format cutoff is correct.
 */
export function buildDaysAgoIso(days: number): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return toIsoDate(cutoff);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function buildThirtyDaysAgoIso(): string {
  return buildDaysAgoIso(30);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** db.getAll() in chunks, so an unbounded ref list can't blow past request size limits. */
async function getAllChunked(
  db: Firestore,
  refs: DocumentReference[],
  size = 300
): Promise<DocumentSnapshot[]> {
  const results: DocumentSnapshot[] = [];
  for (const group of chunkArray(refs, size)) {
    if (group.length === 0) continue;
    const docs = await db.getAll(...group);
    results.push(...docs);
  }
  return results;
}

interface AuthUserSummary {
  uid: string;
  email: string;
  createdIso: string;
  createdMs: number;
  lastSignInIso: string | null;
  lastSignInMs: number | null;
  emailVerified: boolean;
}

/** Page every Auth user, skipping accounts that will never have a Firestore users doc. */
async function listAllAuthUsers(auth: Auth): Promise<AuthUserSummary[]> {
  const users: AuthUserSummary[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.email && NON_USER_AUTH_EMAILS.has(normalizeEmail(user.email))) {
        continue;
      }
      const lastSignInMs = user.metadata.lastSignInTime
        ? new Date(user.metadata.lastSignInTime).getTime()
        : null;
      users.push({
        uid: user.uid,
        email: user.email ?? '(no email)',
        createdIso: user.metadata.creationTime,
        createdMs: new Date(user.metadata.creationTime).getTime(),
        lastSignInIso: user.metadata.lastSignInTime ?? null,
        lastSignInMs,
        emailVerified: user.emailVerified,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

// ---------------------------------------------------------------------------
// Overview report — moved from getAdminStatistics, same helpers/logic
// ---------------------------------------------------------------------------

/**
 * Find every group the admin is an active member of so they can be
 * excluded from statistics (they skew the picture of other users' usage).
 */
export async function getAdminExcludedGroupIds(
  db: Firestore,
  adminUserRef: DocumentReference
): Promise<Set<string>> {
  const adminMembershipsSnapshot = await db
    .collectionGroup('members')
    .where('userRef', '==', adminUserRef)
    .where('active', '==', true)
    .get();
  return new Set<string>(
    adminMembershipsSnapshot.docs
      .map((m) => m.ref.parent.parent?.id)
      .filter((id): id is string => !!id)
  );
}

/** Tally total/active group counts and collect active group refs, excluding the admin's own groups. */
export function summarizeGroups(
  groupsSnapshot: QuerySnapshot,
  excludedGroupIds: Set<string>
): {
  totalGroups: number;
  activeGroups: number;
  activeGroupRefs: DocumentReference[];
} {
  let totalGroups = 0;
  let activeGroups = 0;
  const activeGroupRefs: DocumentReference[] = [];

  for (const groupDoc of groupsSnapshot.docs) {
    if (excludedGroupIds.has(groupDoc.id)) continue;
    totalGroups++;

    const groupData = groupDoc.data();
    if (groupData.active && !groupData.archived) {
      activeGroups++;
      activeGroupRefs.push(groupDoc.ref);
    }
  }

  return { totalGroups, activeGroups, activeGroupRefs };
}

/**
 * For a single group, fire four count() aggregations concurrently —
 * no document downloads required.
 */
export async function getGroupStats(
  groupRef: DocumentReference,
  thirtyDaysAgoIso: string
): Promise<{
  totalMembers: number;
  activeMembers: number;
  hasExpenses: boolean;
  recentExpenses: number;
}> {
  const members = groupRef.collection('members');
  const expenses = groupRef.collection('expenses');
  const [totalMembersSnap, activeMembersSnap, expenseCountSnap, recentExpenseSnap] =
    await Promise.all([
      members.count().get(),
      members.where('active', '==', true).count().get(),
      expenses.count().get(),
      expenses.where('date', '>=', thirtyDaysAgoIso).count().get(),
    ]);
  return {
    totalMembers: totalMembersSnap.data().count,
    activeMembers: activeMembersSnap.data().count,
    hasExpenses: expenseCountSnap.data().count > 0,
    recentExpenses: recentExpenseSnap.data().count,
  };
}

/** Aggregate per-group stats into the overall admin statistics totals. */
export function aggregateGroupStats(
  perGroupStats: Array<{
    totalMembers: number;
    activeMembers: number;
    hasExpenses: boolean;
    recentExpenses: number;
  }>
): {
  activeGroupsWithMultipleMembers: number;
  activeGroupsWithExpenses: number;
  totalMembers: number;
  totalActiveMembers: number;
  groupsWithRecentActivity: number;
  expensesCreatedLast30Days: number;
} {
  let activeGroupsWithMultipleMembers = 0;
  let activeGroupsWithExpenses = 0;
  let totalMembers = 0;
  let totalActiveMembers = 0;
  let groupsWithRecentActivity = 0;
  let expensesCreatedLast30Days = 0;

  for (const g of perGroupStats) {
    totalMembers += g.totalMembers;
    totalActiveMembers += g.activeMembers;
    if (g.activeMembers > 1) activeGroupsWithMultipleMembers++;
    if (g.hasExpenses) activeGroupsWithExpenses++;
    if (g.recentExpenses > 0) groupsWithRecentActivity++;
    expensesCreatedLast30Days += g.recentExpenses;
  }

  return {
    activeGroupsWithMultipleMembers,
    activeGroupsWithExpenses,
    totalMembers,
    totalActiveMembers,
    groupsWithRecentActivity,
    expensesCreatedLast30Days,
  };
}

export async function buildOverviewReport(
  db: Firestore,
  uid: string
): Promise<AdminReportResult> {
  const thirtyDaysAgoIso = buildThirtyDaysAgoIso();

  const adminUserRef = db.collection('users').doc(uid);
  const excludedGroupIds = await getAdminExcludedGroupIds(db, adminUserRef);

  // Fetch group docs, limited to the fields needed to filter on
  // active/archived status, to cut payload size as the collection grows.
  const groupsSnapshot = await db
    .collection('groups')
    .select('active', 'archived')
    .get();
  const { totalGroups, activeGroups, activeGroupRefs } = summarizeGroups(
    groupsSnapshot,
    excludedGroupIds
  );

  const perGroupStats = await Promise.all(
    activeGroupRefs.map((ref) => getGroupStats(ref, thirtyDaysAgoIso))
  );
  const {
    activeGroupsWithMultipleMembers,
    activeGroupsWithExpenses,
    totalMembers,
    totalActiveMembers,
    groupsWithRecentActivity,
    expensesCreatedLast30Days,
  } = aggregateGroupStats(perGroupStats);

  // Count users via aggregation and exclude the admin's own account.
  const usersCountSnap = await db.collection('users').count().get();
  const totalUsers = Math.max(0, usersCountSnap.data().count - 1);

  const avgMembersPerActiveGroup =
    activeGroups > 0
      ? Math.round((totalActiveMembers / activeGroups) * 100) / 100
      : 0;

  return {
    reportId: 'overview',
    title: 'Overview',
    generatedAt: new Date().toISOString(),
    summary: [
      {
        title: 'Groups',
        stats: [
          { label: 'Total Groups', value: totalGroups },
          { label: 'Active Groups', value: activeGroups },
          {
            label: 'Active with 2+ Members',
            value: activeGroupsWithMultipleMembers,
          },
          { label: 'Active with Expenses', value: activeGroupsWithExpenses },
        ],
      },
      {
        title: 'Users & Members',
        stats: [
          { label: 'Total Users', value: totalUsers },
          { label: 'Total Members', value: totalMembers },
          { label: 'Active Members', value: totalActiveMembers },
          {
            label: 'Avg Members/Active Group',
            value: avgMembersPerActiveGroup,
          },
        ],
      },
      {
        title: 'Recent Activity (30 days)',
        stats: [
          { label: 'Groups with Activity', value: groupsWithRecentActivity },
          { label: 'Expenses Created', value: expensesCreatedLast30Days },
        ],
      },
    ],
    tables: [],
  };
}

// ---------------------------------------------------------------------------
// Active Groups report
// ---------------------------------------------------------------------------

export async function buildActiveGroupsReport(
  db: Firestore
): Promise<AdminReportResult> {
  const ACTIVITY_WINDOW_DAYS = 30;
  const cutoffDate = buildDaysAgoIso(ACTIVITY_WINDOW_DAYS);

  const groupsSnap = await db.collection('groups').where('active', '==', true).get();

  const results = await Promise.all(
    groupsSnap.docs.map(async (groupDoc) => {
      const groupData = groupDoc.data();
      if (groupData['archived'] === true) return null;

      const [membersSnap, expenseCountSnap, latestExpenseSnap, latestHistorySnap] =
        await Promise.all([
          groupDoc.ref.collection('members').where('active', '==', true).get(),
          groupDoc.ref.collection('expenses').count().get(),
          groupDoc.ref.collection('expenses').orderBy('date', 'desc').limit(1).get(),
          groupDoc.ref.collection('history').orderBy('date', 'desc').limit(1).get(),
        ]);

      const activeMembers = membersSnap.docs;
      const hasExcludedUser = activeMembers.some((m) =>
        ADMIN_TEST_EMAILS_LOWER.has(
          normalizeEmail((m.data()['email'] as string | undefined) ?? '')
        )
      );

      const latestExpenseDate = latestExpenseSnap.docs[0]?.data()['date'] as
        | string
        | undefined;
      const latestHistoryDate = latestHistorySnap.docs[0]?.data()['date'] as
        | string
        | undefined;
      const activityDates = [latestExpenseDate, latestHistoryDate]
        .filter((d): d is string => !!d)
        .sort((a, b) => a.localeCompare(b));
      const latestActivity =
        activityDates.length > 0 ? activityDates[activityDates.length - 1]! : null;

      return {
        groupName: (groupData['name'] as string) ?? '(unnamed)',
        groupId: groupDoc.id,
        memberCount: activeMembers.length,
        expenseCount: expenseCountSnap.data().count,
        latestActivity,
        hasExcludedUser,
      };
    })
  );

  const filtered = results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter(
      (r) =>
        !r.hasExcludedUser &&
        r.memberCount >= 2 &&
        r.expenseCount >= 1 &&
        r.latestActivity !== null &&
        r.latestActivity >= cutoffDate
    )
    .sort((a, b) => (b.latestActivity as string).localeCompare(a.latestActivity as string));

  return {
    reportId: 'active-groups',
    title: 'Active Groups',
    generatedAt: new Date().toISOString(),
    summary: [
      {
        title: 'Active Groups',
        stats: [{ label: 'Groups matching criteria', value: filtered.length }],
      },
    ],
    tables: [
      {
        title: `Active groups with 2+ members, an expense, and activity in the last ${ACTIVITY_WINDOW_DAYS} days`,
        columns: [
          { key: 'groupName', label: 'Group Name' },
          { key: 'groupId', label: 'Group ID' },
          { key: 'memberCount', label: 'Members', align: 'right' },
          { key: 'expenseCount', label: 'Expenses', align: 'right' },
          { key: 'latestActivity', label: 'Latest Activity' },
        ],
        rows: filtered.map((r) => ({
          groupName: r.groupName,
          groupId: r.groupId,
          memberCount: r.memberCount,
          expenseCount: r.expenseCount,
          latestActivity: r.latestActivity,
        })),
        emptyMessage: 'No groups match the activity criteria.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Users report
// ---------------------------------------------------------------------------

export async function buildUsersReport(auth: Auth): Promise<AdminReportResult> {
  const users = await listAllAuthUsers(auth);
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const totalUsers = users.length;
  const newLast30Days = users.filter((u) => u.createdMs >= cutoffMs).length;
  const activeLast30Days = users.filter(
    (u) => u.lastSignInMs !== null && u.lastSignInMs >= cutoffMs
  ).length;
  const neverSignedIn = users.filter((u) => u.lastSignInMs === null).length;

  const recentSignups = [...users]
    .sort((a, b) => b.createdMs - a.createdMs)
    .slice(0, 25);

  return {
    reportId: 'users',
    title: 'Users',
    generatedAt: new Date().toISOString(),
    summary: [
      {
        title: 'Users',
        stats: [
          { label: 'Total Users', value: totalUsers },
          { label: 'New in Last 30 Days', value: newLast30Days },
          { label: 'Signed In in Last 30 Days', value: activeLast30Days },
          { label: 'Never Signed In', value: neverSignedIn },
        ],
      },
    ],
    tables: [
      {
        title: 'Most Recent Signups',
        columns: [
          { key: 'email', label: 'Email' },
          { key: 'created', label: 'Created' },
          { key: 'lastSignIn', label: 'Last Sign-In' },
          { key: 'emailVerified', label: 'Verified', align: 'center' },
        ],
        rows: recentSignups.map((u) => ({
          email: u.email,
          created: u.createdIso,
          lastSignIn: u.lastSignInIso ?? 'Never',
          emailVerified: u.emailVerified,
        })),
        emptyMessage: 'No users found.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Orphaned Members report + repair
// ---------------------------------------------------------------------------

export async function buildOrphanedMembersReport(
  db: Firestore
): Promise<AdminReportResult> {
  const unlinkedSnap = await db
    .collectionGroup('members')
    .where('userRef', '==', null)
    .get();

  const candidates = unlinkedSnap.docs
    .map((doc) => {
      const data = doc.data();
      const email = data['email'] as string | undefined;
      if (!email) return null; // intentional non-app placeholder, see member.service.ts
      return {
        path: doc.ref.path,
        groupId: doc.ref.parent.parent!.id,
        displayName: (data['displayName'] as string) ?? '(unnamed)',
        email,
        emailLower: normalizeEmail(email),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const matches = await Promise.all(
    candidates.map(async (c) => {
      const usersSnap = await db
        .collection('users')
        .where('emailLower', '==', c.emailLower)
        .get();
      return { ...c, matchedUserIds: usersSnap.docs.map((d) => d.id) };
    })
  );

  const linkable = matches.filter((m) => m.matchedUserIds.length === 1);
  const needsReview = matches.filter((m) => m.matchedUserIds.length > 1);
  const unmatchedCount = matches.filter((m) => m.matchedUserIds.length === 0).length;

  return {
    reportId: 'orphaned-members',
    title: 'Orphaned Members',
    generatedAt: new Date().toISOString(),
    summary: [
      {
        title: 'Orphaned Members',
        stats: [
          { label: 'Unlinked Member Records', value: candidates.length },
          { label: 'Linkable (exact email match)', value: linkable.length },
          { label: 'Needs Manual Review', value: needsReview.length },
          { label: 'No Matching User', value: unmatchedCount },
        ],
      },
    ],
    tables: [
      {
        title: 'Linkable',
        columns: [
          { key: 'groupId', label: 'Group ID' },
          { key: 'displayName', label: 'Member' },
          { key: 'email', label: 'Email' },
          { key: 'matchedUserId', label: 'User ID' },
        ],
        rows: linkable.map((m) => ({
          groupId: m.groupId,
          displayName: m.displayName,
          email: m.email,
          matchedUserId: m.matchedUserIds[0]!,
          path: m.path,
        })),
        emptyMessage: 'No linkable orphaned members found.',
      },
      {
        title: 'Needs manual review (email matches more than one user)',
        columns: [
          { key: 'groupId', label: 'Group ID' },
          { key: 'displayName', label: 'Member' },
          { key: 'email', label: 'Email' },
          { key: 'matchCount', label: 'Matching Users', align: 'right' },
        ],
        rows: needsReview.map((m) => ({
          groupId: m.groupId,
          displayName: m.displayName,
          email: m.email,
          matchCount: m.matchedUserIds.length,
        })),
        emptyMessage: 'None.',
      },
    ],
  };
}

/**
 * Links the given member docs to a user, re-deriving the match server-side
 * from each member's current email rather than trusting a client-supplied
 * user id - the client only ever supplies which member paths to act on.
 * Skips any doc that's no longer unlinked, has no email, or no longer
 * resolves to exactly one user (defends against a race since the report
 * was generated).
 */
export async function repairOrphanedMembersInternal(
  db: Firestore,
  memberPaths: string[]
): Promise<{ linkedCount: number }> {
  if (memberPaths.length === 0) return { linkedCount: 0 };

  const memberRefs = memberPaths.map((p) => db.doc(p));
  const memberDocs = await getAllChunked(db, memberRefs);

  const links = (
    await Promise.all(
      memberDocs.map(async (doc) => {
        if (!doc.exists) return null;
        const data = doc.data()!;
        if (data['userRef'] !== null) return null;
        const email = data['email'] as string | undefined;
        if (!email) return null;
        const usersSnap = await db
          .collection('users')
          .where('emailLower', '==', normalizeEmail(email))
          .get();
        if (usersSnap.size !== 1) return null;
        return { ref: doc.ref, userRef: usersSnap.docs[0]!.ref };
      })
    )
  ).filter((l): l is NonNullable<typeof l> => l !== null);

  for (const group of chunkArray(links, 500)) {
    const batch = db.batch();
    for (const link of group) {
      batch.update(link.ref, { userRef: link.userRef });
    }
    await batch.commit();
  }

  return { linkedCount: links.length };
}

// ---------------------------------------------------------------------------
// Orphaned Registrations report + backfill
// ---------------------------------------------------------------------------

export async function buildOrphanedRegistrationsReport(
  auth: Auth,
  db: Firestore
): Promise<AdminReportResult> {
  const users = await listAllAuthUsers(auth);
  const userDocs = await getAllChunked(
    db,
    users.map((u) => db.collection('users').doc(u.uid))
  );
  const existing = new Set(userDocs.filter((d) => d.exists).map((d) => d.id));
  const orphaned = users.filter((u) => !existing.has(u.uid));

  return {
    reportId: 'orphaned-registrations',
    title: 'Orphaned Registrations',
    generatedAt: new Date().toISOString(),
    summary: [
      {
        title: 'Orphaned Registrations',
        stats: [
          { label: 'Total Auth Users', value: users.length },
          { label: 'Missing Firestore User Doc', value: orphaned.length },
        ],
      },
    ],
    tables: [
      {
        title: 'Missing a Firestore users doc',
        columns: [
          { key: 'uid', label: 'UID' },
          { key: 'email', label: 'Email' },
          { key: 'created', label: 'Created' },
          { key: 'emailVerified', label: 'Verified', align: 'center' },
        ],
        rows: orphaned.map((u) => ({
          uid: u.uid,
          email: u.email,
          created: u.createdIso,
          emailVerified: u.emailVerified,
        })),
        emptyMessage: 'No orphaned registrations found.',
      },
    ],
  };
}

/** Creates the missing users/{uid} doc for each given uid, mirroring createUserProfileOnSignUp's shape. */
export async function backfillOrphanedRegistrationsInternal(
  db: Firestore,
  auth: Auth,
  uids: string[]
): Promise<{ createdCount: number }> {
  if (uids.length === 0) return { createdCount: 0 };

  const userDocs = await getAllChunked(
    db,
    uids.map((uid) => db.collection('users').doc(uid))
  );
  const existing = new Set(userDocs.filter((d) => d.exists).map((d) => d.id));
  const toCreate = uids.filter((uid) => !existing.has(uid));

  const records = await Promise.all(
    toCreate.map(async (uid) => {
      try {
        return await auth.getUser(uid);
      } catch {
        return null;
      }
    })
  );
  const creatable = toCreate
    .map((uid, i) => ({ uid, record: records[i] }))
    .filter((x): x is { uid: string; record: UserRecord } => x.record !== null);

  for (const group of chunkArray(creatable, 500)) {
    const batch = db.batch();
    for (const { uid, record } of group) {
      batch.set(
        db.collection('users').doc(uid),
        {
          email: record.email ?? '',
          defaultGroupRef: null,
          receiptPolicy: false,
          emailOptOut: false,
          venmoId: '',
          paypalId: '',
          cashAppId: '',
          zelleId: '',
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  return { createdCount: creatable.length };
}

// ---------------------------------------------------------------------------
// Duplicate User Accounts report (read-only — resolving needs human judgment)
// ---------------------------------------------------------------------------

export async function buildDuplicateUsersReport(
  auth: Auth,
  db: Firestore
): Promise<AdminReportResult> {
  const byEmail = new Map<string, UserRecord[]>();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (!user.email) continue;
      if (NON_USER_AUTH_EMAILS.has(normalizeEmail(user.email))) continue;
      const key = normalizeEmail(user.email);
      const list = byEmail.get(key) ?? [];
      list.push(user);
      byEmail.set(key, list);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const duplicateGroups = [...byEmail.entries()].filter(([, users]) => users.length > 1);
  const allEntries = duplicateGroups.flatMap(([email, users]) =>
    users.map((user) => ({ email, user }))
  );

  const userDocs =
    allEntries.length > 0
      ? await getAllChunked(
          db,
          allEntries.map(({ user }) => db.collection('users').doc(user.uid))
        )
      : [];
  const hasDocByUid = new Map(userDocs.map((d) => [d.id, d.exists]));

  const memberCounts = await Promise.all(
    allEntries.map(({ user }) =>
      db
        .collectionGroup('members')
        .where('userRef', '==', db.collection('users').doc(user.uid))
        .count()
        .get()
    )
  );

  const rows = allEntries
    .map(({ email, user }, i) => ({
      email,
      uid: user.uid,
      providers: user.providerData.map((p) => p.providerId).join(', ') || '(none)',
      created: user.metadata.creationTime,
      lastSignIn: user.metadata.lastSignInTime ?? 'Never',
      hasUserDoc: hasDocByUid.get(user.uid) ?? false,
      linkedMemberCount: memberCounts[i]!.data().count,
    }))
    .sort((a, b) => a.email.localeCompare(b.email) || a.created.localeCompare(b.created));

  return {
    reportId: 'duplicate-users',
    title: 'Duplicate User Accounts',
    generatedAt: new Date().toISOString(),
    summary: [
      {
        title: 'Duplicate User Accounts',
        stats: [
          { label: 'Emails with Multiple Accounts', value: duplicateGroups.length },
          { label: 'Affected Accounts', value: rows.length },
        ],
      },
    ],
    tables: [
      {
        title: 'Duplicate Accounts',
        columns: [
          { key: 'email', label: 'Email' },
          { key: 'uid', label: 'UID' },
          { key: 'providers', label: 'Providers' },
          { key: 'created', label: 'Created' },
          { key: 'lastSignIn', label: 'Last Sign-In' },
          { key: 'hasUserDoc', label: 'Has User Doc', align: 'center' },
          { key: 'linkedMemberCount', label: 'Linked Members', align: 'right' },
        ],
        rows,
        emptyMessage: 'No duplicate accounts found.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Expense Activity report
// ---------------------------------------------------------------------------

export async function buildExpenseActivityReport(
  db: Firestore
): Promise<AdminReportResult> {
  const cutoff7 = buildDaysAgoIso(7);
  const cutoff30 = buildDaysAgoIso(30);
  const cutoff90 = buildDaysAgoIso(90);

  const expenses = db.collectionGroup('expenses');
  const [totalSnap, last7Snap, last30Snap, last90Snap] = await Promise.all([
    expenses.count().get(),
    expenses.where('date', '>=', cutoff7).count().get(),
    expenses.where('date', '>=', cutoff30).count().get(),
    expenses.where('date', '>=', cutoff90).count().get(),
  ]);

  const monthBounds: { label: string; start: string; end: string }[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 0; i < 6; i++) {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    monthBounds.push({
      label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      start: toIsoDate(start),
      end: toIsoDate(end),
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  const monthCounts = await Promise.all(
    monthBounds.map(({ start, end }) =>
      expenses.where('date', '>=', start).where('date', '<', end).count().get()
    )
  );

  return {
    reportId: 'expense-activity',
    title: 'Expense Activity',
    generatedAt: new Date().toISOString(),
    summary: [
      {
        title: 'Expense Activity',
        stats: [
          { label: 'Total Expenses', value: totalSnap.data().count },
          { label: 'Last 7 Days', value: last7Snap.data().count },
          { label: 'Last 30 Days', value: last30Snap.data().count },
          { label: 'Last 90 Days', value: last90Snap.data().count },
        ],
      },
    ],
    tables: [
      {
        title: 'Expenses by Month',
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'count', label: 'Expenses', align: 'right' },
        ],
        rows: monthBounds.map((m, i) => ({
          month: m.label,
          count: monthCounts[i]!.data().count,
        })),
        emptyMessage: 'No expense data found.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export const runAdminReport = onCall<{ reportId: AdminReportId }>(
  { ...callableAppCheck, timeoutSeconds: 540 },
  async (request) => {
    const uid = assertAdmin(request);
    const reportId = request.data?.reportId;
    const db = getFirestore();
    const auth = getAuth();

    try {
      switch (reportId) {
        case 'overview':
          return await buildOverviewReport(db, uid);
        case 'active-groups':
          return await buildActiveGroupsReport(db);
        case 'users':
          return await buildUsersReport(auth);
        case 'orphaned-members':
          return await buildOrphanedMembersReport(db);
        case 'orphaned-registrations':
          return await buildOrphanedRegistrationsReport(auth, db);
        case 'duplicate-users':
          return await buildDuplicateUsersReport(auth, db);
        case 'expense-activity':
          return await buildExpenseActivityReport(db);
        default:
          throw new HttpsError(
            'invalid-argument',
            `Unknown reportId: ${String(reportId)}`
          );
      }
    } catch (error: unknown) {
      if (error instanceof HttpsError) throw error;
      console.error(`Error running admin report ${reportId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError('internal', `Error running report: ${errorMessage}`);
    }
  }
);

const MAX_REPAIR_TARGETS = 500;
const MEMBER_PATH_PATTERN = /^groups\/[^/]+\/members\/[^/]+$/;

export const repairOrphanedMembers = onCall<{ memberPaths: string[] }>(
  { ...callableAppCheck, timeoutSeconds: 300 },
  async (request) => {
    assertAdmin(request);
    const memberPaths = request.data?.memberPaths;
    if (!Array.isArray(memberPaths) || memberPaths.length === 0) {
      throw new HttpsError('invalid-argument', 'memberPaths must be a non-empty array');
    }
    if (memberPaths.length > MAX_REPAIR_TARGETS) {
      throw new HttpsError(
        'invalid-argument',
        `Too many targets (max ${MAX_REPAIR_TARGETS})`
      );
    }
    if (
      memberPaths.some(
        (p) => typeof p !== 'string' || !MEMBER_PATH_PATTERN.test(p)
      )
    ) {
      throw new HttpsError(
        'invalid-argument',
        'memberPaths must be group member document paths'
      );
    }

    try {
      return await repairOrphanedMembersInternal(getFirestore(), memberPaths);
    } catch (error: unknown) {
      if (error instanceof HttpsError) throw error;
      console.error('Error repairing orphaned members:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError(
        'internal',
        `Error repairing orphaned members: ${errorMessage}`
      );
    }
  }
);

export const backfillOrphanedRegistrations = onCall<{ uids: string[] }>(
  { ...callableAppCheck, timeoutSeconds: 300 },
  async (request) => {
    assertAdmin(request);
    const uids = request.data?.uids;
    if (!Array.isArray(uids) || uids.length === 0) {
      throw new HttpsError('invalid-argument', 'uids must be a non-empty array');
    }
    if (uids.length > MAX_REPAIR_TARGETS) {
      throw new HttpsError(
        'invalid-argument',
        `Too many targets (max ${MAX_REPAIR_TARGETS})`
      );
    }
    if (uids.some((u) => typeof u !== 'string' || u.length === 0)) {
      throw new HttpsError('invalid-argument', 'uids must be non-empty strings');
    }

    try {
      return await backfillOrphanedRegistrationsInternal(
        getFirestore(),
        getAuth(),
        uids
      );
    } catch (error: unknown) {
      if (error instanceof HttpsError) throw error;
      console.error('Error backfilling orphaned registrations:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError(
        'internal',
        `Error backfilling orphaned registrations: ${errorMessage}`
      );
    }
  }
);
