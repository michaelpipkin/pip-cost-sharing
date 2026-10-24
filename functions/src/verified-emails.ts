import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { normalizeEmail, verifiedEmailId } from './email-identity';

// ---------------------------------------------------------------------------
// The verified-address index: every email address a user has proven, so an
// invited member row can be linked to the account that owns its address
// without anyone reading users docs. Server-only (firestore.rules denies
// every client).
//
// verifiedEmails/{verifiedEmailId(address)} = {
//   uid, email (lowercased), verifiedAt, source
// }
//
// One owner per address: the doc id is the address, so a later proof of the
// same address overwrites the earlier one (the most recent proof wins). Only
// addresses from Auth-verified sources belong here (a verified token or Auth
// record, or a confirmed group-email token), never users.email.
// ---------------------------------------------------------------------------

/** Server-only index of proven addresses (rules deny all). */
export const VERIFIED_EMAILS = 'verifiedEmails';

/** How the address was proven. */
export type VerifiedEmailSource = 'login' | 'group-confirm' | 'backfill';

/** Deletes per batch (Firestore's limit is 500 writes). */
const DELETE_BATCH_SIZE = 500;

/**
 * Records `uid` as the owner of `address`, replacing any earlier owner. With
 * `txn` the write joins that transaction (queued, so no await is needed).
 */
export async function upsertVerifiedEmail(
  db: Firestore,
  address: string,
  uid: string,
  source: VerifiedEmailSource,
  txn?: Transaction
): Promise<void> {
  const ref = db.collection(VERIFIED_EMAILS).doc(verifiedEmailId(address));
  const data = {
    uid,
    email: normalizeEmail(address),
    verifiedAt: Timestamp.now(),
    source,
  };
  if (txn) {
    txn.set(ref, data);
  } else {
    await ref.set(data);
  }
}

/** The uid that last proved `address`, or null if nobody has. */
export async function ownerOf(
  db: Firestore,
  address: string
): Promise<string | null> {
  const snap = await db
    .collection(VERIFIED_EMAILS)
    .doc(verifiedEmailId(address))
    .get();
  const uid: unknown = snap.data()?.['uid'];
  return typeof uid === 'string' ? uid : null;
}

/** Every address `uid` owns, lowercased. */
export async function addressesOf(
  db: Firestore,
  uid: string
): Promise<string[]> {
  const snap = await db
    .collection(VERIFIED_EMAILS)
    .where('uid', '==', uid)
    .get();
  return snap.docs.map((doc) => doc.data()['email'] as string);
}

/** Deletes every address `uid` owns. Returns how many it deleted. */
export async function removeAllFor(
  db: Firestore,
  uid: string
): Promise<number> {
  const snap = await db
    .collection(VERIFIED_EMAILS)
    .where('uid', '==', uid)
    .get();
  for (let i = 0; i < snap.docs.length; i += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + DELETE_BATCH_SIZE)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
  return snap.size;
}
