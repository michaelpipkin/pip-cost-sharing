/**
 * Read-only diagnostic (Plan 4 task B12): stored email addresses that fail
 * the app's single-address rule, i.e. values the Firestore rules now refuse
 * to set and every server email now skips:
 *  - Auth users whose email fails the pattern (they can still sign in;
 *    login and forgot-password keep Angular's laxer validator);
 *  - `users` docs whose `email` is set but fails (a write that changes it is
 *    refused; unrelated writes still pass);
 *  - members (collection group) whose `email` is non-empty and fails, or is
 *    null (no payment/settle/invite mail; the edit dialog refuses to save
 *    until the address is fixed).
 *
 * Writes nothing to Firestore or Auth. Prints counts and every id/path, and
 * writes the rows to results.html. Owner/family accounts are not excluded
 * (the list is short enough to read).
 *
 * Run: pnpm query audit-invalid-emails
 */
import { auth, db, logCount, writeTable } from '../lib.ts';
import { auditInvalidEmails, type InvalidEmailRow } from '../email-audit.ts';

const result = await auditInvalidEmails(db, auth);

function print(label: string, rows: InvalidEmailRow[]): void {
  logCount(label, rows.length);
  for (const row of rows) console.log(`  ${row.id}  ${row.email}`);
  console.log();
}

print('Auth users with an invalid email', result.authUsers);
print('users docs with an invalid stored email', result.userDocs);
print('members with an invalid (or null) stored email', result.members);

writeTable('Invalid stored emails', [
  ...result.authUsers.map((r) => ({ source: 'auth', ...r })),
  ...result.userDocs.map((r) => ({ source: 'users', ...r })),
  ...result.members.map((r) => ({ source: 'member', ...r })),
]);
