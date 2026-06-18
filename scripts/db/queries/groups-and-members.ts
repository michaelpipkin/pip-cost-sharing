import { db } from '../lib.ts';
/**
 * Example: list all groups with their active member count.
 *
 * Shows how to:
 *  - query a top-level collection
 *  - fetch a subcollection count per document
 *  - dereference a DocumentReference field (group.defaultCategoryRef)
 *
 * Run: pnpm exec tsx examples/groups-and-members.ts
 */

const groupsSnap = await db.collection('groups').get();

if (groupsSnap.empty) {
  console.log('No groups found.');
  process.exit(0);
}

const results = await Promise.all(
  groupsSnap.docs.map(async (groupDoc) => {
    const membersSnap = await groupDoc.ref
      .collection('members')
      .where('active', '==', true)
      .count()
      .get();

    return {
      id: groupDoc.id,
      name: groupDoc.data()['name'] ?? '(unnamed)',
      activeMembers: membersSnap.data().count,
    };
  })
);

// Sort by name for readability
results.sort(
  (a, b) => b.activeMembers - a.activeMembers || a.name.localeCompare(b.name)
);

console.log(`${'Group name'.padEnd(40)} ${'ID'.padEnd(28)} Members`);
console.log('-'.repeat(80));
for (const r of results) {
  console.log(`${r.name.padEnd(40)} ${r.id.padEnd(28)} ${r.activeMembers}`);
}
