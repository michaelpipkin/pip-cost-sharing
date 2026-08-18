import { db, writeTable } from '../lib.ts';
/**
 * Backfills memberUids / activeMemberUids / adminUids on every group doc
 * from its members subcollection. Mirrors computeGroupMemberArrays in
 * functions/src/index.ts (syncGroupMemberUids trigger) so existing groups
 * don't have to wait for a member write to get these fields populated or
 * corrected.
 *
 * Dry-run by default — prints what would change. Pass --apply to write.
 *
 * Run: pnpm query backfill-member-uids
 *      pnpm query backfill-member-uids --apply
 */

const apply = process.argv.includes('--apply');

function computeGroupMemberArrays(membersData: Record<string, any>[]): {
  memberUids: string[];
  activeMemberUids: string[];
  adminUids: string[];
} {
  const memberUids: string[] = [];
  const activeMemberUids: string[] = [];
  const adminUids: string[] = [];

  for (const data of membersData) {
    const uid = data['userRef']?.id as string | undefined;
    if (!uid) continue;
    memberUids.push(uid);
    if (data['active'] === true) {
      activeMemberUids.push(uid);
      if (data['groupAdmin'] === true) {
        adminUids.push(uid);
      }
    }
  }

  return { memberUids, activeMemberUids, adminUids };
}

function sameUids(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((uid) => b.includes(uid));
}

const groupsSnap = await db.collection('groups').get();

if (groupsSnap.empty) {
  console.log('No groups found.');
  process.exit(0);
}

const changes: {
  id: string;
  name: string;
  memberBefore: number;
  memberAfter: number;
  activeBefore: number;
  activeAfter: number;
  adminBefore: number;
  adminAfter: number;
}[] = [];

for (const groupDoc of groupsSnap.docs) {
  const membersSnap = await groupDoc.ref.collection('members').get();
  const { memberUids, activeMemberUids, adminUids } = computeGroupMemberArrays(
    membersSnap.docs.map((d) => d.data())
  );

  const current = groupDoc.data();
  const currentMemberUids: string[] = current['memberUids'] ?? [];
  const currentActiveUids: string[] = current['activeMemberUids'] ?? [];
  const currentAdminUids: string[] = current['adminUids'] ?? [];

  const unchanged =
    sameUids(memberUids, currentMemberUids) &&
    sameUids(activeMemberUids, currentActiveUids) &&
    sameUids(adminUids, currentAdminUids);
  if (unchanged) continue;

  changes.push({
    id: groupDoc.id,
    name: (current['name'] as string) ?? '(unnamed)',
    memberBefore: currentMemberUids.length,
    memberAfter: memberUids.length,
    activeBefore: currentActiveUids.length,
    activeAfter: activeMemberUids.length,
    adminBefore: currentAdminUids.length,
    adminAfter: adminUids.length,
  });

  if (apply) {
    await groupDoc.ref.update({ memberUids, activeMemberUids, adminUids });
  }
}

if (changes.length === 0) {
  console.log('All groups already have correct membership arrays. Nothing to do.');
  process.exit(0);
}

console.log(
  apply
    ? `Updated ${changes.length} group(s):\n`
    : `${changes.length} group(s) would be updated (dry run — pass --apply to write):\n`
);
console.log(
  `${'Group Name'.padEnd(40)} ${'ID'.padEnd(30)} members  active  admins`
);
console.log('-'.repeat(100));
for (const c of changes) {
  const members = `${c.memberBefore}->${c.memberAfter}`.padEnd(8);
  const active = `${c.activeBefore}->${c.activeAfter}`.padEnd(7);
  const admins = `${c.adminBefore}->${c.adminAfter}`;
  console.log(`${c.name.padEnd(40)} ${c.id.padEnd(30)} ${members} ${active} ${admins}`);
}

writeTable(
  apply
    ? 'Membership Arrays Backfill — Applied'
    : 'Membership Arrays Backfill — Dry Run',
  changes.map((c) => ({
    'Group Name': c.name,
    ID: c.id,
    'memberUids': `${c.memberBefore} -> ${c.memberAfter}`,
    'activeMemberUids': `${c.activeBefore} -> ${c.activeAfter}`,
    'adminUids': `${c.adminBefore} -> ${c.adminAfter}`,
  }))
);
