/**
 * Seeds the verified-address index (`verifiedEmails/{id}`) from Firebase Auth
 * for accounts that existed before it (users-read-lockdown design §7.3; logic:
 * ../verified-email-backfill.ts). Invited members link to accounts through
 * this index, so it must hold every existing account's verified address.
 *
 * WHEN TO RUN:
 *  - Dry-run BEFORE merging the release (read-only), to size the work.
 *  - Pass --apply right AFTER the release's CI deploy finishes.
 *  - Dry-run again afterwards; expect 0 to create.
 *
 * Source: Auth accounts with a verified email, minus NON_USER_AUTH_EMAILS.
 * Per address: create when the index has no entry, skip when it already
 * names the same uid, conflict when it names another uid (reported, never
 * overwritten: a newer confirmation wins). Existing entries are never
 * overwritten; creates are create-only.
 * Also lists, report only, unlinked members whose address now has an owner.
 * They link on the owner's next Groups load or through the admin repair; this
 * script never changes members and never touches Auth.
 *
 * DRY RUN BY DEFAULT - prints the plan and writes nothing. Pass --apply to
 * write (chunked batches). This targets PRODUCTION (lib.ts: ADC, project
 * pip-cost-sharing; it refuses to start while any *_EMULATOR_HOST is set).
 * --apply refuses when Auth returned zero users (the wrong backend).
 *
 * Run: pnpm query backfill-verified-emails [-- --apply]
 */
import {
  applyVerifiedEmailBackfill,
  listBackfillAuthUsers,
  planUnlinkedMembersWithOwner,
  planVerifiedEmailBackfill,
  readUnlinkedMembers,
  readVerifiedEmailOwners,
} from '../verified-email-backfill.ts';
import { auth, db, logCount, NON_USER_AUTH_EMAILS, writeTable } from '../lib.ts';

const apply = process.argv.includes('--apply');

const authUsers = await listBackfillAuthUsers(auth);
const existing = await readVerifiedEmailOwners(db);
const plan = planVerifiedEmailBackfill(authUsers, existing, NON_USER_AUTH_EMAILS);
const pending = planUnlinkedMembersWithOwner(
  await readUnlinkedMembers(db),
  existing,
  plan
);

logCount('Auth accounts', authUsers.length);
logCount('verifiedEmails entries now', existing.size);
logCount('To create', plan.create.length);
logCount('Skipped (already owned by the same account)', plan.skip);
logCount('Conflicts (owned by another account, left as is)', plan.conflicts.length);
for (const c of plan.conflicts) {
  console.log(`  ${c.email}: auth ${c.uid}, index owner ${c.ownerUid}`);
}
console.log();

logCount('Unlinked members whose address has an owner (never changed)', pending.length);
for (const m of pending) {
  console.log(`  ${m.memberPath}  ${JSON.stringify(m.email)}  owner ${m.ownerUid}`);
}
console.log();

writeTable('Verified-address backfill', [
  ...plan.create.map((c) => ({
    kind: 'create',
    id: c.id,
    email: c.email,
    uid: c.uid,
    ownerUid: '',
  })),
  ...plan.conflicts.map((c) => ({
    kind: 'conflict (left as is)',
    id: c.email,
    email: c.email,
    uid: c.uid,
    ownerUid: c.ownerUid,
  })),
  ...pending.map((m) => ({
    kind: 'unlinked member (review only)',
    id: m.memberPath,
    email: m.email,
    uid: '',
    ownerUid: m.ownerUid,
  })),
]);

if (apply) {
  if (authUsers.length === 0) {
    console.error(
      'Not applying: Auth returned zero users: this is not the production Auth backend ' +
        '(check for an emulator variable or the wrong credentials).'
    );
    process.exit(1);
  }
  const created = await applyVerifiedEmailBackfill(db, plan);
  logCount('Created', created);
  logCount('Skipped (appeared since the scan)', plan.create.length - created);
} else {
  console.log('Dry run: nothing written. Pass -- --apply (after the release is deployed) to write.');
}
