/**
 * Read-only diagnostic for a specific orphaned registration (Auth account,
 * no Firestore users doc) - shows the full Auth record plus any app_errors
 * entries near their registration time, to find out *why* account creation
 * failed for this specific person (App Check throttle vs. offline/network
 * vs. something else).
 *
 * Run: pnpm query inspect-orphaned-registration -- <uid1> [uid2 ...]
 */
import { auth, db } from '../lib.ts';

const uids = process.argv.slice(process.argv.indexOf('--') + 1);
if (uids.length === 0) {
  console.log('Usage: pnpm query inspect-orphaned-registration -- <uid1> [uid2 ...]');
  process.exit(1);
}

const WINDOW_MS = 10 * 60 * 1000; // +/- 10 minutes around registration

for (const uid of uids) {
  console.log(`=== ${uid} ===`);

  let createdMs: number | null = null;
  try {
    const authUser = await auth.getUser(uid);
    createdMs = new Date(authUser.metadata.creationTime).getTime();
    console.log(
      `  auth: email=${authUser.email} verified=${authUser.emailVerified} providers=${authUser.providerData.map((p) => p.providerId).join(',')}`
    );
    console.log(`  created: ${authUser.metadata.creationTime}`);
    console.log(`  lastSignIn: ${authUser.metadata.lastSignInTime}`);
    console.log(`  lastRefresh: ${authUser.metadata.lastRefreshTime ?? '(none)'}`);
  } catch (error) {
    console.log(`  auth: (no auth record) ${error instanceof Error ? error.message : error}`);
  }

  const userDoc = await db.collection('users').doc(uid).get();
  console.log(`  users doc exists: ${userDoc.exists}`);

  if (createdMs !== null) {
    const errorsSnap = await db
      .collection('app_errors')
      .where('component', '==', 'User Service')
      .get();
    const nearby = errorsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as any)
      .filter((e) => {
        const ts = e.timestamp?.toDate?.()?.getTime();
        return ts !== undefined && Math.abs(ts - createdMs!) <= WINDOW_MS;
      })
      .sort((a, b) => a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime());

    console.log(`  app_errors within +/-10min of registration: ${nearby.length}`);
    for (const e of nearby) {
      console.log(
        `    ${e.timestamp.toDate().toISOString()}  ${e.action}: ${e.message}${e.error ? ` | error: ${e.error}` : ''}`
      );
      if (e.additionalInfo) console.log(`      additionalInfo: ${e.additionalInfo}`);
    }
  }
  console.log();
}
