import { db, writeTable } from '../lib.ts';
/**
 * Backfills `emailLower` (a lowercased copy of `email`) on every `users` doc
 * and every `groups/{groupId}/members/{memberId}` doc, so existing docs
 * don't have to wait for a write to pick up the field. Mirrors the
 * computation done by the syncUserEmailLower / syncMemberEmailLower Cloud
 * Functions triggers (functions/src/index.ts) - part of making email
 * matching case-insensitive, since Firestore has no case-insensitive query
 * operator. Docs with a blank/missing email are skipped, matching the
 * triggers' placeholder-member semantics.
 *
 * Also reports (does not block on) same-email-different-case collisions
 * that already exist in the data - e.g. two `users` docs, or two members of
 * the same group, whose emails differ only by casing. These are pre-existing
 * data issues this backfill surfaces rather than causes; review them.
 *
 * Dry-run by default — prints what would change. Pass --apply to write.
 *
 * Run: pnpm query backfill-email-lower
 *      pnpm query backfill-email-lower --apply
 */

const apply = process.argv.includes('--apply');

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type Change = { collection: string; path: string; email: string; emailLower: string };

const changes: Change[] = [];
const userEmailLowers = new Map<string, string[]>(); // emailLower -> uid[]

const usersSnap = await db.collection('users').get();
for (const userDoc of usersSnap.docs) {
  const email = userDoc.data()['email'] as string | undefined;
  if (!email) continue;

  const emailLower = normalizeEmail(email);
  userEmailLowers.set(emailLower, [
    ...(userEmailLowers.get(emailLower) ?? []),
    userDoc.id,
  ]);

  if (userDoc.data()['emailLower'] === emailLower) continue;
  changes.push({ collection: 'users', path: userDoc.id, email, emailLower });
  if (apply) {
    await userDoc.ref.update({ emailLower });
  }
}

const memberEmailLowersByGroup = new Map<string, Map<string, string[]>>(); // groupId -> emailLower -> memberId[]

const membersSnap = await db.collectionGroup('members').get();
for (const memberDoc of membersSnap.docs) {
  const email = memberDoc.data()['email'] as string | undefined;
  if (!email) continue;

  const groupId = memberDoc.ref.parent.parent!.id;
  const emailLower = normalizeEmail(email);
  const byEmail = memberEmailLowersByGroup.get(groupId) ?? new Map<string, string[]>();
  byEmail.set(emailLower, [...(byEmail.get(emailLower) ?? []), memberDoc.id]);
  memberEmailLowersByGroup.set(groupId, byEmail);

  if (memberDoc.data()['emailLower'] === emailLower) continue;
  changes.push({
    collection: `groups/${groupId}/members`,
    path: memberDoc.id,
    email,
    emailLower,
  });
  if (apply) {
    await memberDoc.ref.update({ emailLower });
  }
}

if (changes.length === 0) {
  console.log('All docs already have correct emailLower. Nothing to do.');
} else {
  console.log(
    apply
      ? `Updated ${changes.length} doc(s):\n`
      : `${changes.length} doc(s) would be updated (dry run — pass --apply to write):\n`
  );
  console.log(
    `${'Collection'.padEnd(30)} ${'Doc ID'.padEnd(24)} ${'Email'.padEnd(30)} emailLower`
  );
  console.log('-'.repeat(110));
  for (const c of changes) {
    console.log(
      `${c.collection.padEnd(30)} ${c.path.padEnd(24)} ${c.email.padEnd(30)} ${c.emailLower}`
    );
  }
}

const userCollisions = [...userEmailLowers.entries()].filter(
  ([, uids]) => uids.length > 1
);
if (userCollisions.length > 0) {
  console.log(
    `\n${userCollisions.length} case-only duplicate(s) among existing users — pre-existing data issue, review manually:\n`
  );
  for (const [emailLower, uids] of userCollisions) {
    console.log(`  ${emailLower} -> ${uids.join(', ')}`);
  }
}

const memberCollisions: { groupId: string; emailLower: string; memberIds: string[] }[] = [];
for (const [groupId, byEmail] of memberEmailLowersByGroup) {
  for (const [emailLower, memberIds] of byEmail) {
    if (memberIds.length > 1) {
      memberCollisions.push({ groupId, emailLower, memberIds });
    }
  }
}
if (memberCollisions.length > 0) {
  console.log(
    `\n${memberCollisions.length} case-only duplicate member(s) within the same group — pre-existing data issue, review manually:\n`
  );
  for (const c of memberCollisions) {
    console.log(`  group ${c.groupId}: ${c.emailLower} -> ${c.memberIds.join(', ')}`);
  }
}

writeTable(
  apply ? 'emailLower Backfill — Applied' : 'emailLower Backfill — Dry Run',
  changes.map((c) => ({
    Collection: c.collection,
    'Doc ID': c.path,
    Email: c.email,
    emailLower: c.emailLower,
  }))
);
