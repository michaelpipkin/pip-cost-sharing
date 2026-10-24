import type { DocumentReference } from 'firebase-admin/firestore';
import { verifiedEmailId } from '../../../functions/src/email-identity.ts';
import { db, writeTable } from '../lib.ts';
/**
 * Repair for member records left unlinked (userRef == null) although their
 * address has an owner. Joins each unlinked row against the verified-address
 * index (verifiedEmails/{verifiedEmailId(email)}), the same match the
 * server's own linking uses (syncMemberEmailLower, linkInvitedMembers):
 * the index holds only addresses a user proved, one owner per address.
 * Members with a blank email are intentional non-app placeholders (see
 * member.service.ts addMemberToGroup) and are skipped.
 *
 * Keeps one row per account per group: a row is not linked when its owner
 * already has a row in that group, or when an earlier row in this run links
 * the owner there.
 *
 * Dry-run by default — prints what would change. Pass --apply to write.
 *
 * Run: pnpm query link-orphaned-members
 *      pnpm query link-orphaned-members --apply
 */

const apply = process.argv.includes('--apply');

const unlinkedSnap = await db
  .collectionGroup('members')
  .where('userRef', '==', null)
  .get();

if (unlinkedSnap.empty) {
  console.log('No unlinked member records found.');
  process.exit(0);
}

const linked: {
  groupId: string;
  memberId: string;
  displayName: string;
  email: string;
  userId: string;
}[] = [];
let alreadyInGroup = 0;
// "<members collection path>|<uid>" for every link made in this run.
const linkedInGroup = new Set<string>();

for (const memberDoc of unlinkedSnap.docs) {
  const data = memberDoc.data();
  const email: unknown = data['email'];
  if (typeof email !== 'string') continue;
  const id = verifiedEmailId(email);
  if (id === '') continue; // intentional non-app placeholder, skip

  const indexDoc = await db.collection('verifiedEmails').doc(id).get();
  const userId: unknown = indexDoc.get('uid');
  if (typeof userId !== 'string') continue;

  const userRef: DocumentReference = db.collection('users').doc(userId);
  const groupKey = `${memberDoc.ref.parent.path}|${userId}`;
  if (linkedInGroup.has(groupKey)) {
    alreadyInGroup++;
    continue;
  }
  const existing = await memberDoc.ref.parent
    .where('userRef', '==', userRef)
    .limit(1)
    .get();
  if (!existing.empty) {
    alreadyInGroup++;
    continue;
  }
  linkedInGroup.add(groupKey);

  linked.push({
    groupId: memberDoc.ref.parent.parent!.id,
    memberId: memberDoc.id,
    displayName: (data['displayName'] as string) ?? '(unnamed)',
    email,
    userId,
  });
  if (apply) {
    await memberDoc.ref.update({ userRef });
  }
}

if (linked.length === 0) {
  console.log('No unlinked member records have an address owner.');
} else {
  console.log(
    apply
      ? `Linked ${linked.length} member record(s):\n`
      : `${linked.length} member record(s) would be linked (dry run — pass --apply to write):\n`
  );
  console.log(
    `${'Group ID'.padEnd(24)} ${'Member'.padEnd(24)} ${'Email'.padEnd(30)} User ID`
  );
  console.log('-'.repeat(100));
  for (const l of linked) {
    console.log(
      `${l.groupId.padEnd(24)} ${l.displayName.padEnd(24)} ${l.email.padEnd(30)} ${l.userId}`
    );
  }
}

if (alreadyInGroup > 0) {
  console.log(
    `\n${alreadyInGroup} row(s) skipped: the address owner already has a row in that group.`
  );
}

writeTable(
  apply ? 'Orphaned Member Links — Applied' : 'Orphaned Member Links — Dry Run',
  linked.map((l) => ({
    'Group ID': l.groupId,
    Member: l.displayName,
    Email: l.email,
    'User ID': l.userId,
  }))
);
