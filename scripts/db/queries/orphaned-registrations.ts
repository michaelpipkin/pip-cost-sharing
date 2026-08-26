/**
 * Read-only diagnostic: Auth users created in the last N days who have no
 * matching Firestore `users/{uid}` document - the failure mode from the
 * App-Check-throttled cold-boot bug (see .claude/app-check-enforcement-
 * followup.md). createUserIfNotExists() reads the doc before creating one,
 * so a throttled first login leaves a real Auth account with no document
 * ever created.
 *
 * Writes a table (uid, email, created, emailVerified) to results.html for
 * following up with affected users. Adjust DAYS below as needed.
 *
 * Run: pnpm query orphaned-registrations
 */
import { auth, db, writeTable, logCount, NON_USER_AUTH_EMAILS } from '../lib.ts';

const DAYS = 7;
const cutoffMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;

const recentUsers: { uid: string; email: string; created: string; emailVerified: boolean }[] = [];
let pageToken: string | undefined;

do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    if (user.email && NON_USER_AUTH_EMAILS.has(user.email)) continue;
    const createdMs = new Date(user.metadata.creationTime).getTime();
    if (createdMs >= cutoffMs) {
      recentUsers.push({
        uid: user.uid,
        email: user.email ?? '(no email)',
        created: user.metadata.creationTime,
        emailVerified: user.emailVerified,
      });
    }
  }
  pageToken = page.pageToken;
} while (pageToken);

logCount(`Auth users registered in the last ${DAYS} days`, recentUsers.length);

const orphaned: Record<string, unknown>[] = [];
for (const u of recentUsers) {
  const doc = await db.collection('users').doc(u.uid).get();
  if (!doc.exists) {
    orphaned.push(u);
  }
}

logCount('Of those, missing a Firestore users doc', orphaned.length);
console.log();
for (const u of orphaned) {
  console.log(`  ${u['uid']}  ${u['email']}  created=${u['created']}  emailVerified=${u['emailVerified']}`);
}

writeTable(`Orphaned registrations - last ${DAYS} days`, orphaned);
