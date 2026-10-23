import {
  Timestamp,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { deleteDocsIfUnchanged } from './common';

// ---------------------------------------------------------------------------
// A per-uid call allowance over a window that starts at a uid's first call:
// `{collection}/{uid}` holds { windowStart: Timestamp, count }. Server-only
// (rules deny all). Used by requestMemberEmailChange (member-email.ts) and
// getMemberPaymentMethods (payment-methods.ts); the nightly cleanup deletes
// ended windows.
//
// `nowMs` is a parameter, not read here, so a caller can charge and refund
// against the same instant.
// ---------------------------------------------------------------------------

export interface AllowanceOptions {
  /** The counter collection, one doc per uid. */
  collection: string;
  uid: string;
  /** Calls allowed per window. */
  limit: number;
  windowMs: number;
  nowMs: number;
  /** The `resource-exhausted` message when the window's calls are used up. */
  exhaustedMessage: string;
}

/** Counts one call against the uid's window, or refuses it. */
export async function consumeAllowance(
  db: Firestore,
  o: AllowanceOptions
): Promise<void> {
  const limitRef = db.collection(o.collection).doc(o.uid);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(limitRef);
    const windowStart = snap.get('windowStart') as Timestamp | undefined;
    const count = (snap.get('count') as number | undefined) ?? 0;
    if (
      !snap.exists ||
      !(windowStart instanceof Timestamp) ||
      o.nowMs - windowStart.toMillis() >= o.windowMs
    ) {
      txn.set(limitRef, {
        windowStart: Timestamp.fromMillis(o.nowMs),
        count: 1,
      });
      return;
    }
    if (count >= o.limit) {
      throw new HttpsError('resource-exhausted', o.exhaustedMessage);
    }
    txn.update(limitRef, { count: count + 1 });
  });
}

/**
 * Gives back one call `consumeAllowance` charged in the window that started
 * at or before `nowMs`: used when the work it paid for was refused after all
 * (a lost race). A window that has rolled over since is left alone.
 */
export async function refundAllowance(
  db: Firestore,
  o: Omit<AllowanceOptions, 'limit' | 'exhaustedMessage'>
): Promise<void> {
  const limitRef = db.collection(o.collection).doc(o.uid);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(limitRef);
    const windowStart = snap.get('windowStart') as Timestamp | undefined;
    const count = (snap.get('count') as number | undefined) ?? 0;
    if (
      count > 0 &&
      windowStart instanceof Timestamp &&
      windowStart.toMillis() <= o.nowMs
    ) {
      txn.update(limitRef, { count: count - 1 });
    }
  });
}

/**
 * Deletes the collection's counter docs whose window has ended. Skips a doc
 * written after the query read it, e.g. a window a call just restarted.
 * Returns how many it deleted.
 */
export async function deleteExpiredAllowanceWindows(
  db: Firestore,
  collection: string,
  windowMs: number,
  nowMs: number
): Promise<number> {
  const ended: Query = db
    .collection(collection)
    .where('windowStart', '<=', Timestamp.fromMillis(nowMs - windowMs));
  return deleteDocsIfUnchanged((await ended.get()).docs);
}
