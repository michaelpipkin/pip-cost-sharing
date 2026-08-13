import { db } from '../lib.ts';
/**
 * Read-only diagnostic: dumps every member of a specific group with
 * JSON.stringify on the email/userRef fields, so hidden whitespace or
 * unexpected types are visible (a padded console table can hide a trailing
 * space; JSON.stringify won't). Written to debug why
 * link-confirmed-case-mismatches couldn't find Krystal's member doc in
 * group CpDXpS8BYoqsmkaJPttn despite matching the original
 * link-orphaned-members dry run.
 *
 * Run: pnpm query inspect-group-members -- <groupId>
 */

const groupId = process.argv[process.argv.length - 1];

const membersSnap = await db
  .collection('groups')
  .doc(groupId)
  .collection('members')
  .get();

if (membersSnap.empty) {
  console.log(`No members found in group ${groupId}.`);
  process.exit(0);
}

console.log(`${membersSnap.size} member(s) in group ${groupId}:\n`);
for (const doc of membersSnap.docs) {
  const data = doc.data();
  console.log(`--- ${doc.id} ---`);
  console.log(`  displayName: ${JSON.stringify(data['displayName'])}`);
  console.log(`  email:       ${JSON.stringify(data['email'])}`);
  console.log(`  emailLower:  ${JSON.stringify(data['emailLower'])}`);
  console.log(`  userRef:     ${data['userRef'] === null ? 'null' : data['userRef'] === undefined ? '(field absent)' : `ref -> ${data['userRef'].id}`}`);
  console.log(`  active:      ${JSON.stringify(data['active'])}`);
  console.log();
}
