/**
 * Example: count expenses across all groups using collectionGroup + count().
 *
 * Also shows a filtered count — expenses in the last 30 days — using the
 * same date-string comparison pattern already used in getAdminStatistics
 * (functions/src/index.ts:762).
 *
 * Run: pnpm exec tsx examples/expenses-count-aggregation.ts
 */
import { db, logCount } from '../lib.ts';

// ISO date string 30 days ago — expenses store date as "YYYY-MM-DD" strings
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

const [allSnap, recentSnap] = await Promise.all([
  db.collectionGroup('expenses').count().get(),
  db.collectionGroup('expenses').where('date', '>=', thirtyDaysAgo).count().get(),
]);

logCount('Total expenses (all groups)', allSnap.data().count);
logCount(`Expenses in last 30 days (date >= ${thirtyDaysAgo})`, recentSnap.data().count);
