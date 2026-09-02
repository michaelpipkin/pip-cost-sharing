import { db, writeTable } from '../lib.ts';
/**
 * Lists active groups that have at least 2 non-excluded active members,
 * at least 1 expense, and some activity (an expense or a recorded
 * payment) within the last 30 days.
 *
 * Run: pnpm query queries/active-groups.ts
 */

const EXCLUDED_EMAILS = new Set([
  'michael.a.pipkin@gmail.com',
  'blkordis@gmail.com',
  'pip668@yahoo.com',
]);

const ACTIVITY_WINDOW_DAYS = 30;
const cutoffDate = new Date(
  Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000
)
  .toISOString()
  .slice(0, 10);

const groupsSnap = await db
  .collection('groups')
  .where('active', '==', true)
  .get();

if (groupsSnap.empty) {
  console.log('No active groups found.');
  process.exit(0);
}

const results = await Promise.all(
  groupsSnap.docs.map(async (groupDoc) => {
    const [membersSnap, expensesSnap, latestExpenseSnap, latestHistorySnap] =
      await Promise.all([
        groupDoc.ref.collection('members').where('active', '==', true).get(),
        groupDoc.ref.collection('expenses').count().get(),
        groupDoc.ref
          .collection('expenses')
          .orderBy('date', 'desc')
          .limit(1)
          .get(),
        groupDoc.ref
          .collection('history')
          .orderBy('date', 'desc')
          .limit(1)
          .get(),
      ]);

    const activeMembers = membersSnap.docs;
    const hasExcludedUser = activeMembers.some((m) =>
      EXCLUDED_EMAILS.has(m.data()['email'])
    );

    const latestExpenseDate = latestExpenseSnap.docs[0]?.data()['date'] as
      string | undefined;
    const latestHistoryDate = latestHistorySnap.docs[0]?.data()['date'] as
      string | undefined;

    const latestActivityDate = [latestExpenseDate, latestHistoryDate]
      .filter((d): d is string => !!d)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);

    return {
      id: groupDoc.id,
      name: (groupDoc.data()['name'] as string) ?? '(unnamed)',
      memberCount: activeMembers.length,
      expenseCount: expensesSnap.data().count,
      latestActivityDate: latestActivityDate ?? '—',
      hasExcludedUser,
    };
  })
);

const filtered = results
  .filter(
    (r) =>
      !r.hasExcludedUser &&
      r.memberCount >= 2 &&
      r.expenseCount >= 1 &&
      r.latestActivityDate >= cutoffDate
  )
  .sort((a, b) => b.latestActivityDate.localeCompare(a.latestActivityDate));

if (filtered.length === 0) {
  console.log('No groups match the criteria.');
  process.exit(0);
}

console.log(`Found ${filtered.length} group(s):\n`);
console.log(
  `${'Group Name'.padEnd(40)} ${'ID'.padEnd(30)} ${'Members'.padEnd(10)} ${'Expenses'.padEnd(10)} Latest Activity`
);
console.log('-'.repeat(108));
for (const r of filtered) {
  console.log(
    `${r.name.padEnd(40)} ${r.id.padEnd(30)} ${String(r.memberCount).padEnd(10)} ${String(r.expenseCount).padEnd(10)} ${r.latestActivityDate}`
  );
}

writeTable(
  'Active Groups',
  filtered.map(
    ({ name, id, memberCount, expenseCount, latestActivityDate }) => ({
      'Group Name': name,
      ID: id,
      Members: memberCount,
      Expenses: expenseCount,
      'Latest Activity': latestActivityDate,
    })
  )
);
