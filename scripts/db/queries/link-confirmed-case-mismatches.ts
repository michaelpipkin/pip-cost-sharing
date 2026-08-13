import { db, writeTable } from '../lib.ts';
/**
 * One-off repair for two specific unlinked member records confirmed by
 * `link-orphaned-members` to be case-only email mismatches (real accounts,
 * verified manually - Gmail treats these as the same mailbox):
 *
 *   - group CpDXpS8BYoqsmkaJPttn, member "Krystal" (Krystalsombke@gmail.com)
 *     -> user XxjQh1gEkkZDqglUSoaJU82VIA22
 *   - group NLAgoLHqdIi2bPh9Ab3P, member "Brie K" (Blkordis@gmail.com)
 *     -> user zOg98nqr5cQjm77DM84MzLGuctX2
 *
 * Re-derives the member doc at run time (rather than hardcoding a doc ID)
 * and re-verifies userRef is still null and the target user's email still
 * matches case-insensitively before writing, in case state has moved on
 * since the dry run. Matches by scanning the group's unlinked members and
 * comparing trimmed+lowercased emails in JS, rather than an exact
 * `where('email', ...)` - the first attempt at this script used an exact
 * match and silently missed a real match because the stored email had
 * whitespace that wasn't visible in the earlier dry-run table's padded
 * console output. This also sidesteps needing a collection-group index for
 * a bare `email` filter (a plain per-group members query only needs the
 * automatic single-field index Firestore already provides). Not a general
 * case-insensitive linker - see the planned emailLower migration for the
 * systemic fix.
 *
 * Dry-run by default — prints what would change. Pass --apply to write.
 *
 * Run: pnpm query link-confirmed-case-mismatches
 *      pnpm query link-confirmed-case-mismatches --apply
 */

const apply = process.argv.includes('--apply');

const targets: { groupId: string; memberEmail: string; userId: string }[] = [
  {
    groupId: 'CpDXpS8BYoqsmkaJPttn',
    memberEmail: 'Krystalsombke@gmail.com',
    userId: 'XxjQh1gEkkZDqglUSoaJU82VIA22',
  },
  {
    groupId: 'NLAgoLHqdIi2bPh9Ab3P',
    memberEmail: 'Blkordis@gmail.com',
    userId: 'zOg98nqr5cQjm77DM84MzLGuctX2',
  },
];

const results: {
  groupId: string;
  memberEmail: string;
  userId: string;
  status: string;
}[] = [];

for (const target of targets) {
  const userDoc = await db.collection('users').doc(target.userId).get();
  if (!userDoc.exists) {
    results.push({ ...target, status: 'SKIPPED - user doc not found' });
    continue;
  }
  const userEmail = userDoc.data()?.['email'] as string | undefined;
  if (!userEmail || userEmail.toLowerCase() !== target.memberEmail.toLowerCase()) {
    results.push({
      ...target,
      status: `SKIPPED - user email now "${userEmail ?? '(none)'}", no longer matches`,
    });
    continue;
  }

  const targetLower = target.memberEmail.trim().toLowerCase();
  const unlinkedInGroup = await db
    .collection('groups')
    .doc(target.groupId)
    .collection('members')
    .where('userRef', '==', null)
    .get();
  const memberDoc = unlinkedInGroup.docs.find((d) => {
    const email = d.data()['email'] as string | undefined;
    return (email ?? '').trim().toLowerCase() === targetLower;
  });

  if (!memberDoc) {
    results.push({
      ...target,
      status: 'SKIPPED - no matching unlinked member found in group',
    });
    continue;
  }

  if (apply) {
    await memberDoc.ref.update({ userRef: userDoc.ref });
  }
  results.push({ ...target, status: apply ? 'LINKED' : 'would link (dry run)' });
}

console.log(
  apply ? 'Applied:\n' : 'Dry run — pass --apply to write:\n'
);
console.log(
  `${'Group ID'.padEnd(24)} ${'Member Email'.padEnd(30)} ${'User ID'.padEnd(30)} Status`
);
console.log('-'.repeat(110));
for (const r of results) {
  console.log(
    `${r.groupId.padEnd(24)} ${r.memberEmail.padEnd(30)} ${r.userId.padEnd(30)} ${r.status}`
  );
}

writeTable(
  apply ? 'Confirmed Case Mismatches — Applied' : 'Confirmed Case Mismatches — Dry Run',
  results.map((r) => ({
    'Group ID': r.groupId,
    'Member Email': r.memberEmail,
    'User ID': r.userId,
    Status: r.status,
  }))
);
