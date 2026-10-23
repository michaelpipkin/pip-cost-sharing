import { DocumentReference, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { consumeAllowance } from './call-allowance';
import { callableAppCheck, isDocId } from './common';
import { NOT_ACTIVE_MEMBER, requireVerifiedCaller } from './member-email';

/** Per-uid lookup counters. Server-only (rules deny all). */
export const PAYMENT_LOOKUP_LIMITS = 'paymentLookupLimits';
/** Lookups per uid per 24 h window. */
export const PAYMENT_LOOKUP_DAILY_LIMIT = 100;
export const PAYMENT_LOOKUP_LIMIT_REACHED =
  "You've looked up too many payment details today. Try again tomorrow.";

/** The rolling window the daily limit counts over. */
export const PAYMENT_LOOKUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MemberPaymentMethods {
  venmoId: string;
  paypalId: string;
  cashAppId: string;
  zelleId: string;
}

function handle(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * A group member's payment handles, for the Pay dialog. The users collection
 * is readable only by its owner, so another member's handles come from here.
 * Checks, in order: signed in (unauthenticated); both ids are doc ids
 * (invalid-argument); the caller's login email is verified (permission-denied
 * VERIFY_LOGIN_EMAIL, or unavailable AUTH_LOOKUP_UNAVAILABLE); the group
 * exists and the caller is in its activeMemberUids (permission-denied
 * NOT_ACTIVE_MEMBER); the member row exists in that group (not-found; an
 * inactive member can still be owed). The daily allowance is charged last, so
 * a refused call costs nothing.
 *
 * Returns only the four handles, each '' when missing, and all '' when the
 * row is unlinked or its users doc is gone. Never the email, emailOptOut or
 * uid.
 */
export const getMemberPaymentMethods = onCall<
  { groupId?: unknown; memberId?: unknown },
  Promise<MemberPaymentMethods>
>(callableAppCheck, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  const { groupId, memberId } = request.data ?? {};
  if (!isDocId(groupId) || !isDocId(memberId)) {
    throw new HttpsError(
      'invalid-argument',
      'groupId and memberId are required'
    );
  }
  await requireVerifiedCaller(uid);

  const db = getFirestore();
  const groupRef = db.collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();
  const activeUids: unknown = groupSnap.get('activeMemberUids');
  if (!Array.isArray(activeUids) || !activeUids.includes(uid)) {
    throw new HttpsError('permission-denied', NOT_ACTIVE_MEMBER);
  }
  const memberSnap = await groupRef.collection('members').doc(memberId).get();
  if (!memberSnap.exists) {
    throw new HttpsError('not-found', 'Member not found');
  }

  await consumeAllowance(db, {
    collection: PAYMENT_LOOKUP_LIMITS,
    uid,
    limit: PAYMENT_LOOKUP_DAILY_LIMIT,
    windowMs: PAYMENT_LOOKUP_WINDOW_MS,
    nowMs: Date.now(),
    exhaustedMessage: PAYMENT_LOOKUP_LIMIT_REACHED,
  });

  const none: MemberPaymentMethods = {
    venmoId: '',
    paypalId: '',
    cashAppId: '',
    zelleId: '',
  };
  const userRef: unknown = memberSnap.get('userRef');
  if (!(userRef instanceof DocumentReference)) return none;
  const userSnap = await db.collection('users').doc(userRef.id).get();
  if (!userSnap.exists) return none;
  return {
    venmoId: handle(userSnap.get('venmoId')),
    paypalId: handle(userSnap.get('paypalId')),
    cashAppId: handle(userSnap.get('cashAppId')),
    zelleId: handle(userSnap.get('zelleId')),
  };
});
