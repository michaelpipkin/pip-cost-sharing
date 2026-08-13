import { db, writeTable } from '../lib.ts';
/**
 * One-time repair for member records left unlinked by the App Check token
 * race in linkInvitedMembers (2026-08-10 through the client-side fix - see
 * .claude/app-check-enforcement-followup.md). Mirrors linkInvitedMembers'
 * own predicate exactly: collectionGroup('members') where userRef == null,
 * joined against users by exact email match. Members with a blank email are
 * intentional non-app placeholders (see member.service.ts addMemberToGroup)
 * and are skipped.
 *
 * Case sensitivity note: nothing in the app lowercases invite/account
 * emails, so the exact-match join mirrors linkInvitedMembers rather than
 * repairing more than the original function would have. Any
 * case-insensitive-only matches are printed separately as informational -
 * review those manually before deciding whether to link them.
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

const usersSnap = await db.collection('users').get();
const userIdByEmail = new Map<string, string>();
const userIdsByLowerEmail = new Map<string, string[]>();

for (const userDoc of usersSnap.docs) {
  const email = userDoc.data()['email'] as string | undefined;
  if (!email) continue;
  userIdByEmail.set(email, userDoc.id);
  const lower = email.toLowerCase();
  userIdsByLowerEmail.set(lower, [
    ...(userIdsByLowerEmail.get(lower) ?? []),
    userDoc.id,
  ]);
}

const linked: {
  groupId: string;
  memberId: string;
  displayName: string;
  email: string;
  userId: string;
}[] = [];

const caseInsensitiveOnly: {
  groupId: string;
  memberId: string;
  displayName: string;
  email: string;
  candidateUserId: string;
}[] = [];

for (const memberDoc of unlinkedSnap.docs) {
  const data = memberDoc.data();
  const email = data['email'] as string | undefined;
  if (!email) continue; // intentional non-app placeholder, skip

  const groupId = memberDoc.ref.parent.parent!.id;
  const displayName = (data['displayName'] as string) ?? '(unnamed)';

  const exactUserId = userIdByEmail.get(email);
  if (exactUserId) {
    linked.push({
      groupId,
      memberId: memberDoc.id,
      displayName,
      email,
      userId: exactUserId,
    });
    if (apply) {
      await memberDoc.ref.update({
        userRef: db.collection('users').doc(exactUserId),
      });
    }
    continue;
  }

  for (const candidateUserId of userIdsByLowerEmail.get(email.toLowerCase()) ?? []) {
    caseInsensitiveOnly.push({
      groupId,
      memberId: memberDoc.id,
      displayName,
      email,
      candidateUserId,
    });
  }
}

if (linked.length === 0) {
  console.log('No exact email matches found among unlinked member records.');
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

if (caseInsensitiveOnly.length > 0) {
  console.log(
    `\n${caseInsensitiveOnly.length} unlinked member(s) have a case-insensitive-only email match — NOT linked automatically, review manually:\n`
  );
  console.log(
    `${'Group ID'.padEnd(24)} ${'Member'.padEnd(24)} ${'Member Email'.padEnd(30)} Candidate User ID`
  );
  console.log('-'.repeat(100));
  for (const c of caseInsensitiveOnly) {
    console.log(
      `${c.groupId.padEnd(24)} ${c.displayName.padEnd(24)} ${c.email.padEnd(30)} ${c.candidateUserId}`
    );
  }
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
