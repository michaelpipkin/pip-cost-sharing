import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { normalizeEmail, onePerGroupLinks } from './common';
import { addressesOf } from './verified-emails';

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
