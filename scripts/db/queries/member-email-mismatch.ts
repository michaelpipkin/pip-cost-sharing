import { auth, db } from '../lib.ts';
import type { DocumentReference } from 'firebase-admin/firestore';

/**
 * Read-only audit: linked group members (userRef set) whose group email
 * differs (case-insensitively) from the linked user's profile email
 * (users/{uid}.email). Sizes the "existing custom group email" question for
 * the verified group-email feature. Writes nothing.
 *
 * Run: pnpm query member-email-mismatch
 */

const norm = (v: unknown): string =>
  typeof v === 'string' ? v.trim().toLowerCase() : '';

const membersSnap = await db.collectionGroup('members').get();

const linked = membersSnap.docs.filter((d) => {
  const ref = d.get('userRef');
  return ref && typeof ref === 'object' && 'id' in ref;
});

const userRefs = new Map<string, DocumentReference>();
for (const d of linked) {
  const ref = d.get('userRef') as DocumentReference;
  userRefs.set(ref.path, ref);
}

const users = new Map<string, FirebaseFirestore.DocumentData | undefined>();
const refList = [...userRefs.values()];
for (let i = 0; i < refList.length; i += 300) {
  const snaps = await db.getAll(...refList.slice(i, i + 300));
  for (const s of snaps) users.set(s.ref.path, s.exists ? s.data() : undefined);
}

let blankMember = 0;
let missingUser = 0;
let blankProfile = 0;
const blankProfileMembers: { member: string; uid: string; memberEmail: string }[] = [];
const mismatches: {
  member: string;
  displayName: string;
  memberEmail: string;
  profileEmail: string;
  active: unknown;
}[] = [];

for (const d of linked) {
  const ref = d.get('userRef') as DocumentReference;
  const user = users.get(ref.path);
  const memberEmail = norm(d.get('email'));
  if (!memberEmail) {
    blankMember++;
    continue;
  }
  if (user === undefined) {
    missingUser++;
    continue;
  }
  const profileEmail = norm(user['email']);
  if (!profileEmail) {
    blankProfile++;
    blankProfileMembers.push({ member: d.ref.path, uid: ref.id, memberEmail: String(d.get('email')) });
    continue;
  }
  if (memberEmail !== profileEmail) {
    mismatches.push({
      member: d.ref.path,
      displayName: String(d.get('displayName') ?? ''),
      memberEmail: String(d.get('email')),
      profileEmail: String(user['email']),
      active: d.get('active'),
    });
  }
}

console.log(`Members (all groups): ${membersSnap.size}`);
console.log(`Linked members (userRef set): ${linked.length}`);
console.log(`  linked with blank group email: ${blankMember}`);
console.log(`  linked to a missing users doc: ${missingUser}`);
console.log(`  linked to a user with a blank profile email: ${blankProfile}`);
if (blankProfileMembers.length) {
  // Auth is the source of truth for the sign-in address; show what it holds.
  const authUsers = await auth.getUsers(
    blankProfileMembers.map((b) => ({ uid: b.uid }))
  );
  const byUid = new Map(authUsers.users.map((u) => [u.uid, u]));
  for (const b of blankProfileMembers) {
    const u = byUid.get(b.uid);
    const authInfo = u
      ? `auth email ${JSON.stringify(u.email ?? null)} (verified=${u.emailVerified}, providers=${u.providerData.map((p) => p.providerId).join('+') || 'none'}, created=${u.metadata.creationTime}, lastSignIn=${u.metadata.lastSignInTime})`
      : 'no Auth account';
    console.log(`    - ${b.member} -> users/${b.uid}, group email ${JSON.stringify(b.memberEmail)}; ${authInfo}`);
  }
}
console.log(`  group email differs from profile email: ${mismatches.length}`);
for (const m of mismatches) {
  console.log(
    `  - ${m.member} (${JSON.stringify(m.displayName)}, active=${JSON.stringify(m.active)}): group ${JSON.stringify(m.memberEmail)} vs profile ${JSON.stringify(m.profileEmail)}`
  );
}
