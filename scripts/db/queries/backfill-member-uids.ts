import { db, writeTable } from '../lib.ts';
/**
 * Backfills `memberUids` on every group doc from its members subcollection
 * (non-null `userRef.id` values). Mirrors the computation done by the
 * syncGroupMemberUids trigger (functions/src/index.ts) so existing groups
 * don't have to wait for a member write to get the field populated.
 *
 * Dry-run by default — prints what would change. Pass --apply to write.
 *
 * Run: pnpm query backfill-member-uids
 *      pnpm query backfill-member-uids --apply
 */

const apply = process.argv.includes('--apply');

const groupsSnap = await db.collection('groups').get();

if (groupsSnap.empty) {
  console.log('No groups found.');
  process.exit(0);
}

const changes: {
  id: string;
  name: string;
  before: number;
  after: number;
}[] = [];

for (const groupDoc of groupsSnap.docs) {
  const membersSnap = await groupDoc.ref.collection('members').get();
  const memberUids = membersSnap.docs
    .map((doc) => (doc.data()['userRef'] as any)?.id as string | undefined)
    .filter((uid): uid is string => !!uid);

  const currentUids: string[] = groupDoc.data()['memberUids'] ?? [];
  const unchanged =
    memberUids.length === currentUids.length &&
    memberUids.every((uid) => currentUids.includes(uid));
  if (unchanged) continue;

  changes.push({
    id: groupDoc.id,
    name: (groupDoc.data()['name'] as string) ?? '(unnamed)',
    before: currentUids.length,
    after: memberUids.length,
  });

  if (apply) {
    await groupDoc.ref.update({ memberUids });
  }
}

if (changes.length === 0) {
  console.log('All groups already have correct memberUids. Nothing to do.');
  process.exit(0);
}

console.log(
  apply
    ? `Updated ${changes.length} group(s):\n`
    : `${changes.length} group(s) would be updated (dry run — pass --apply to write):\n`
);
console.log(`${'Group Name'.padEnd(40)} ${'ID'.padEnd(30)} Before  After`);
console.log('-'.repeat(90));
for (const c of changes) {
  console.log(
    `${c.name.padEnd(40)} ${c.id.padEnd(30)} ${String(c.before).padEnd(7)} ${c.after}`
  );
}

writeTable(
  apply ? 'memberUids Backfill — Applied' : 'memberUids Backfill — Dry Run',
  changes.map((c) => ({
    'Group Name': c.name,
    ID: c.id,
    'Before Count': c.before,
    'After Count': c.after,
  }))
);
