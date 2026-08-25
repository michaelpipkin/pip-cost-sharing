/**
 * Backfill: creates the missing Firestore `users/{uid}` doc for every Auth
 * user that doesn't have one (see .claude/orphaned-registrations-
 * investigation.md). These accounts predate createUserProfileOnSignUp
 * (functions/src/user-onboarding.ts) - that trigger only fires on new
 * account creation, so it can't retroactively fix them. Client-side login
 * would eventually self-heal each one (see UserService.initializeUserSession
 * / createUserIfNotExists), but only if the affected user comes back and
 * stays on the tab through the full 8s waitForServerCreatedUser() timeout
 * plus the write - this backfill just does it directly, server-side, now.
 *
 * Default field shape mirrors createUserProfileOnSignUp's - keep both in
 * sync if the default user doc shape ever changes.
 *
 * DRY RUN BY DEFAULT - only lists what it would create. Pass --confirm to
 * actually write. This touches real production data (no emulator env set,
 * see lib.ts) - review the dry-run output before confirming.
 *
 * Run: pnpm query backfill-orphaned-registrations [-- --confirm]
 */
import { auth, db, writeTable, logCount, NON_USER_AUTH_EMAILS } from '../lib.ts';

const confirmed = process.argv.includes('--confirm');

const allUsers: { uid: string; email: string; created: string }[] = [];
let pageToken: string | undefined;

do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    if (user.email && NON_USER_AUTH_EMAILS.has(user.email)) continue;
    allUsers.push({
      uid: user.uid,
      email: user.email ?? '(no email)',
      created: user.metadata.creationTime,
    });
  }
  pageToken = page.pageToken;
} while (pageToken);

logCount('Total Auth users', allUsers.length);

const orphaned: { uid: string; email: string; created: string }[] = [];
for (const u of allUsers) {
  const doc = await db.collection('users').doc(u.uid).get();
  if (!doc.exists) {
    orphaned.push(u);
  }
}

logCount('Missing a Firestore users doc', orphaned.length);
console.log();

if (orphaned.length === 0) {
  console.log('Nothing to backfill.');
  process.exit(0);
}

for (const u of orphaned) {
  console.log(`  ${confirmed ? 'creating' : 'would create'}  ${u.uid}  ${u.email}  created=${u.created}`);
  if (confirmed) {
    await db
      .collection('users')
      .doc(u.uid)
      .set(
        {
          email: u.email === '(no email)' ? '' : u.email,
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
}

console.log();
console.log(
  confirmed
    ? `Created ${orphaned.length} missing user doc(s).`
    : `Dry run only - no writes made. Re-run with --confirm to create these ${orphaned.length} doc(s).`
);

writeTable(
  confirmed ? 'Backfilled orphaned registrations' : 'Orphaned registrations (dry run - not yet backfilled)',
  orphaned
);
