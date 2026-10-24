import type {
  DocumentData,
  DocumentReference,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { normalizeEmail, onePerGroupLinks } from './common';
import { addressesOf, ownerOf } from './verified-emails';

/** Values one `in` query takes. */
const IN_QUERY_LIMIT = 30;
/** Writes per batch (Firestore's limit is 500). */
const BATCH_SIZE = 500;

/**
 * Links every unlinked member row whose email is one of `uid`'s indexed
 * addresses (the verified-address index), and returns how many it linked.
 *
 * Matches on `emailLower`, then re-checks the row's own `email`: a linked
 * member's email must be one its user proved they own, and `emailLower` lags
 * an email change until syncMemberEmailLower catches up. Keeps one row per
 * group (onePerGroupLinks): none in a group where `uid` already has a row,
 * and only one of several invited rows in the same group.
 */
export async function linkPendingMembersFor(
  db: Firestore,
  uid: string
): Promise<number> {
  const addresses = [...new Set(await addressesOf(db, uid))];
  if (addresses.length === 0) return 0;
  const owned = new Set(addresses);

  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += IN_QUERY_LIMIT) {
    chunks.push(addresses.slice(i, i + IN_QUERY_LIMIT));
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db
        .collectionGroup('members')
        .where('emailLower', 'in', chunk)
        .where('userRef', '==', null)
        .get()
    )
  );

  const matching: QueryDocumentSnapshot[] = [];
  for (const snap of snaps) {
    for (const memberDoc of snap.docs) {
      const memberEmail: unknown = memberDoc.get('email');
      if (
        typeof memberEmail === 'string' &&
        owned.has(normalizeEmail(memberEmail))
      ) {
        matching.push(memberDoc);
      }
    }
  }

  const userRef = db.collection('users').doc(uid);
  const links = await onePerGroupLinks(
    matching.map((memberDoc) => ({ ref: memberDoc.ref, userRef }))
  );
  for (let i = 0; i < links.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const link of links.slice(i, i + BATCH_SIZE)) {
      batch.update(link.ref, { userRef });
    }
    await batch.commit();
  }
  return links.length;
}

/** What linkMemberByVerifiedEmail did with a member write. */
export type MemberLinkResult =
  | 'linked'
  | 'not-applicable'
  | 'no-owner'
  | 'already-in-group'
  | 'stale';

/** The normalized address of a member doc's `email`, or '' if it has none. */
function memberAddress(data: DocumentData | undefined): string {
  const email: unknown = data?.['email'];
  return typeof email === 'string' ? normalizeEmail(email) : '';
}

/**
 * Links an unlinked row to the owner of its email, when the write created the
 * row or changed its email. `before` and `after` are the row's data around
 * the write (`before` undefined for a create).
 *
 * Any other write is left alone, so an admin's unlink (userRef to null, same
 * email) and account deletion's anonymizing never re-link. The link runs in
 * a transaction that re-reads the row (stale if it is gone, already linked,
 * or its email has changed again since this write) and checks the row's own
 * group for a row already linked to the owner, so one account never gets
 * two rows in a group, even when two rows are linked at once (logged, as
 * 'already-in-group'), and never to an account whose users doc no longer
 * exists ('no-owner').
 */
export async function linkMemberByVerifiedEmail(
  db: Firestore,
  memberRef: DocumentReference,
  before: DocumentData | undefined,
  after: DocumentData
): Promise<MemberLinkResult> {
  const address = memberAddress(after);
  if (
    after['userRef'] !== null ||
    address === '' ||
    (before !== undefined && memberAddress(before) === address)
  ) {
    return 'not-applicable';
  }

  const owner = await ownerOf(db, address);
  if (owner === null) return 'no-owner';
  const userRef = db.collection('users').doc(owner);

  const result = await db.runTransaction<MemberLinkResult>(async (txn) => {
    const current = await txn.get(memberRef);
    if (
      !current.exists ||
      current.get('userRef') !== null ||
      memberAddress(current.data()) !== address
    ) {
      return 'stale';
    }
    const [existing, ownerDoc] = await Promise.all([
      txn.get(memberRef.parent.where('userRef', '==', userRef).limit(1)),
      txn.get(userRef),
    ]);
    // A deleted account's index entry can come back (a second signed-in
    // device, or the removeAllFor race): never link to an account that is gone.
    if (!ownerDoc.exists) return 'no-owner';
    if (!existing.empty) return 'already-in-group';
    txn.update(memberRef, { userRef, emailLower: address });
    return 'linked';
  });
  if (result === 'already-in-group') {
    // An admin added one person twice under two of their addresses, or
    // re-invited someone who left (leaveGroup keeps their row).
    console.warn(
      `Not linking ${memberRef.path}: user ${owner} already has a row in its group`
    );
  }
  return result;
}
