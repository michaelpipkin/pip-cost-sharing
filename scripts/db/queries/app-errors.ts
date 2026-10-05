/**
 * Read-only export of the app_errors collection (the admin Error Log has no
 * export of its own). Newest first. Prints each entry as one JSON line to
 * stdout (easy to redirect/grep) and writes the standard results.html table.
 *
 * Optional: limit to the last N days.
 * Run: pnpm query app-errors            (everything)
 *      pnpm query app-errors -- 30      (last 30 days)
 */
import { db, logCount, writeTable } from '../lib.ts';

const dashIndex = process.argv.indexOf('--');
const daysArg = dashIndex === -1 ? undefined : process.argv[dashIndex + 1];
const days = daysArg ? Number(daysArg) : undefined;
if (days !== undefined && (!Number.isFinite(days) || days <= 0)) {
  console.error(`Invalid day count: "${daysArg}"`);
  process.exit(1);
}

let query = db.collection('app_errors').orderBy('timestamp', 'desc');
if (days !== undefined) {
  query = query.where(
    'timestamp',
    '>=',
    new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  );
}

const snap = await query.get();

const rows = snap.docs.map((d) => {
  const data = d.data();
  return {
    timestamp: data['timestamp']?.toDate?.()?.toISOString() ?? '',
    component: data['component'] ?? '',
    action: data['action'] ?? '',
    message: data['message'] ?? '',
    error: data['error'] ?? '',
    additionalInfo: data['additionalInfo'] ?? '',
    id: d.id,
  };
});

for (const row of rows) console.log(JSON.stringify(row));
console.error();
logCount(
  days === undefined ? 'app_errors (all time)' : `app_errors (last ${days} days)`,
  rows.length
);

writeTable(
  days === undefined ? 'App errors - all time' : `App errors - last ${days} days`,
  rows
);
