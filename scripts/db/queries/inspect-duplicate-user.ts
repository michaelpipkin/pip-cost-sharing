import { auth, db } from '../lib.ts';
/**
 * Read-only diagnostic for a set of user IDs that share the same emailLower
 * (surfaced by backfill-email-lower's collision report). Shows each user
 * doc's full data plus whether any member record currently links to it, so
 * a real duplicate-account situation can be told apart from e.g. a stale
 * test account before deciding how to handle it.
 *
 * Run: pnpm query inspect-duplicate-user -- <uid1> <uid2> [...]
 */

const uids = process.argv.slice(process.argv.indexOf('--') + 1);
if (uids.length === 0) {
  console.log('Usage: pnpm query inspect-duplicate-user -- <uid1> <uid2> [...]');
  process.exit(1);
}

for (const uid of uids) {
  console.log(`=== ${uid} ===`);

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    console.log('  (no users doc)');
  } else {
    console.log(`  users doc: ${JSON.stringify(userDoc.data())}`);
  }

  try {
    const authUser = await auth.getUser(uid);
    console.log(
      `  auth: email=${authUser.email} verified=${authUser.emailVerified} providers=${authUser.providerData.map((p) => p.providerId).join(',')} created=${authUser.metadata.creationTime} lastSignIn=${authUser.metadata.lastSignInTime}`
    );
  } catch (error) {
    console.log(`  auth: (no auth record) ${error instanceof Error ? error.message : error}`);
  }

  const linkedMembers = await db
    .collectionGroup('members')
    .where('userRef', '==', db.collection('users').doc(uid))
    .get();
  console.log(`  linked member records: ${linkedMembers.size}`);
  for (const m of linkedMembers.docs) {
    console.log(
      `    group ${m.ref.parent.parent!.id} / member ${m.id}: displayName=${m.data()['displayName']} active=${m.data()['active']}`
    );
  }
  console.log();
}
