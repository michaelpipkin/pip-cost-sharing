/**
 * Clears profile emails that the account never verified (Plan 4 task B14).
 * Profiles written before B14 can hold an unverified or foreign address in
 * `users/{uid}.email`/`emailLower`, and invites link to accounts by that
 * address (member.service lookups, repairOrphanedMembers,
 * link-orphaned-members). This sets each such profile to the account's
 * verified Auth address, or '' (logic: ../profile-email-audit.ts).
 *
 * WHEN TO RUN:
 *  - Dry-run BEFORE the B14 release, to size the problem.
 *  - Pass --apply only AFTER B14 (rules, functions and app) is deployed.
 *    Before that, an old client's session sync rewrites the unverified Auth
 *    address on the user's next load and undoes the cleanup.
 *  - Dry-run again a day later; expect zero (stale cached PWA clients are
 *    blocked from rewriting by the new rules).
 *  - Run repairOrphanedMembers / link-orphaned-members only after this.
 *
 * Flags a `users` doc with a non-empty email or emailLower when:
 *  - no-auth-user: there is no Auth account for the uid;
 *  - unverified: the Auth account isn't verified;
 *  - foreign: the address differs from the verified Auth address;
 *  - lower-mismatch: emailLower is out of step with email.
 * Also lists, for MANUAL REVIEW ONLY, linked members whose email isn't the
 * linked account's verified address. It never unlinks or changes members,
 * and never touches Auth.
 *
 * DRY RUN BY DEFAULT - prints the planned changes and writes nothing. Pass
 * --apply to write (chunked batches). This targets PRODUCTION (lib.ts: ADC,
 * project pip-cost-sharing, no emulator) - review the dry run first.
 *
 * Run: pnpm query clear-unverified-profile-emails [-- --apply]
 */
import {
  applyProfileEmailFixes,
  auditProfileEmails,
} from '../profile-email-audit.ts';
import { auth, db, logCount, NON_USER_AUTH_EMAILS, writeTable } from '../lib.ts';

const apply = process.argv.includes('--apply');

const { fixes, reviewMembers } = await auditProfileEmails(
  db,
  auth,
  NON_USER_AUTH_EMAILS
);

logCount('users docs to fix', fixes.length);
for (const reason of [
  'no-auth-user',
  'unverified',
  'foreign',
  'lower-mismatch',
] as const) {
  logCount(`  ${reason}`, fixes.filter((f) => f.reasons.includes(reason)).length);
}
for (const f of fixes) {
  console.log(
    `  ${apply ? 'setting' : 'would set'} users/${f.uid} email: ${JSON.stringify(f.email)} -> ${JSON.stringify(f.target)}` +
      ` (${f.reasons.join(', ')}; auth ${JSON.stringify(f.authEmail)}, verified ${f.authVerified})`
  );
}
console.log();

logCount('Linked members to review by hand (never changed)', reviewMembers.length);
for (const m of reviewMembers) {
  console.log(
    `  ${m.memberPath}  member ${JSON.stringify(m.memberEmail)}  linked ${m.linkedUid}` +
      ` (auth ${JSON.stringify(m.authEmail)}, verified ${m.authVerified})`
  );
}
console.log();

writeTable('Profile emails to clear, and linked members to review', [
  ...fixes.map((f) => ({
    kind: 'users doc',
    id: f.uid,
    reasons: f.reasons.join(', '),
    storedEmail: f.email,
    storedEmailLower: f.emailLower,
    authEmail: f.authEmail,
    authVerified: f.authVerified,
    target: f.target,
  })),
  ...reviewMembers.map((m) => ({
    kind: 'member (review only)',
    id: m.memberPath,
    reasons: `linked to ${m.linkedUid}`,
    storedEmail: m.memberEmail,
    storedEmailLower: '',
    authEmail: m.authEmail,
    authVerified: m.authVerified,
    target: '(unchanged)',
  })),
]);

if (apply) {
  const { applied, skipped } = await applyProfileEmailFixes(db, fixes);
  logCount('Applied', applied);
  logCount('Skipped', skipped.length);
  for (const s of skipped) console.log(`  users/${s.uid}: ${s.reason}`);
} else {
  console.log('Dry run: nothing written. Pass -- --apply (after B14 is deployed) to write.');
}
