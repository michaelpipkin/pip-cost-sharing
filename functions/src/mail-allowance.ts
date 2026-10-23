import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { deleteDocsIfUnchanged } from './common';

// ---------------------------------------------------------------------------
// The per-caller daily allowance for group mail (owner follow-up: "No
// per-caller rate limit on group mail"). Each group-mail call is capped at 25
// recipients and an invite at one per member per 24 hours, but nothing
// bounded how many calls one verified account makes, so one account could
// create groups, add any address and mail it repeatedly. Every recipient the
// callables below QUEUE counts against the caller's uid; a skipped recipient
// (opted out, not registered, no valid address) does not.
//
// Covered: sendPaymentRequests, sendPaymentReversalEmails and
// sendSettleReversalEmails (group-emails.ts) and sendGroupInvite (index.ts).
// Exempt, deliberately:
//  - trigger-sent mail (history -> mail queue: handleMemberPaymentEmail,
//    handleSettleEmail, and the mail queue sender itself): a trigger has no
//    caller to charge, and its mail follows a write the rules already gate;
//  - notifyNewIssue: its recipient is the hard-coded admin address, so it
//    can't be aimed at anyone else;
//  - requestMemberEmailChange (member-email.ts), which has its own per-uid
//    and per-recipient limits.
//
// The window is rolling, to the hour: a doc per uid holds a count per UTC
// hour, and a recipient counts while its hour is within the last 24 full
// hours plus the current one, so it counts for at least 24 hours (at most
// 25). A call that would take the caller past the limit is refused whole
// (resource-exhausted) before anything is queued: GROUP_MAIL_LIMIT_REACHED
// once nothing is left, GROUP_MAIL_LIMIT_EXCEEDED while a smaller call would
// still fit. Each callable already sends all of its recipients or none, so
// sending a part would leave the caller unable to tell who was told. (The
// app sends a long list as several calls, one after another, and reports
// what went out before a refusal: src/app/services/user.service.ts.)
//
// Storage: groupMailLimits/{uid} = { hours: { "<utc hour>": count }, expiresAt },
// server-only (firestore.rules denies every client). expiresAt is the moment
// the newest bucket stops counting, when the doc is no longer needed: the
// nightly cleanup (index.ts deleteOldPaidExpenses) deletes such docs, and a
// Firestore TTL policy on groupMailLimits.expiresAt could do the same (not
// configured in production).
// ---------------------------------------------------------------------------

/** Per-uid group-mail counters. Server-only (rules deny all). */
export const GROUP_MAIL_LIMITS = 'groupMailLimits';

/** Recipients one caller may have mailed in the rolling 24 hours. */
export const GROUP_MAIL_DAILY_LIMIT = 100;

const HOUR_MS = 60 * 60 * 1000;
/** Earlier hours still counted besides the current one (so >= 24 hours). */
const WINDOW_HOURS = 24;

/** resource-exhausted: the caller's daily allowance is used up. */
export const GROUP_MAIL_LIMIT_REACHED =
  "You've reached today's limit for group emails. Try again tomorrow.";
/**
 * resource-exhausted: some allowance is left, but this call needs more
 * (review M1: "reached" would be untrue, since a smaller call still fits).
 */
export const GROUP_MAIL_LIMIT_EXCEEDED =
  "This would go over today's limit for group emails. Try again tomorrow.";

/** The refusal for a caller who has already used `used` recipients. */
export function groupMailLimitError(used: number): HttpsError {
  return new HttpsError(
    'resource-exhausted',
    used >= GROUP_MAIL_DAILY_LIMIT
      ? GROUP_MAIL_LIMIT_REACHED
      : GROUP_MAIL_LIMIT_EXCEEDED
  );
}

/** reserveGroupMail's answer: charged, or refused with the count so far. */
export type GroupMailReservation = { ok: true } | { ok: false; used: number };

/** The UTC hour `nowMs` falls in, as a whole number of hours since 1970. */
export function groupMailHour(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS);
}

/** The doc's buckets that still count at `nowMs`. Malformed entries count 0. */
function liveBuckets(
  data: DocumentData | undefined,
  nowMs: number
): Record<string, number> {
  const hours: unknown = data?.['hours'];
  const live: Record<string, number> = {};
  if (typeof hours !== 'object' || hours === null) return live;
  const oldest = groupMailHour(nowMs) - WINDOW_HOURS;
  for (const [hour, count] of Object.entries(hours)) {
    if (
      Number(hour) >= oldest &&
      typeof count === 'number' &&
      Number.isFinite(count) &&
      count > 0
    ) {
      live[hour] = count;
    }
  }
  return live;
}

/** Recipients the doc still counts at `nowMs`. */
export function liveGroupMailCount(
  data: DocumentData | undefined,
  nowMs: number
): number {
  return Object.values(liveBuckets(data, nowMs)).reduce((a, b) => a + b, 0);
}

/**
 * Reserves `count` recipients of the caller's allowance inside `txn`: reads
 * the caller's doc and, when they fit, writes the new count (dropping ended
 * buckets). Refuses, writing nothing, when they don't. Any reads the
 * caller's transaction needs must come before this call (it writes).
 */
export async function reserveGroupMail(
  txn: Transaction,
  db: Firestore,
  uid: string,
  count: number,
  nowMs: number
): Promise<GroupMailReservation> {
  if (count <= 0) return { ok: true };
  const ref = db.collection(GROUP_MAIL_LIMITS).doc(uid);
  const snap = await txn.get(ref);
  const hours = liveBuckets(snap.data(), nowMs);
  const used = Object.values(hours).reduce((a, b) => a + b, 0);
  if (used + count > GROUP_MAIL_DAILY_LIMIT) return { ok: false, used };
  const nowHour = groupMailHour(nowMs);
  hours[String(nowHour)] = (hours[String(nowHour)] ?? 0) + count;
  txn.set(ref, {
    hours,
    expiresAt: Timestamp.fromMillis((nowHour + WINDOW_HOURS + 1) * HOUR_MS),
  });
  return { ok: true };
}

export interface QueuedMail {
  to: string;
  message: { subject: string; text: string; html: string };
}

/**
 * Queues `mails` (in the shape sendMailQueueEmail delivers) and charges them
 * to the caller, in one transaction: all of them, or (over the allowance)
 * none, with groupMailLimitError. An empty list queues and charges nothing,
 * and is never refused.
 */
export async function queueGroupMail(
  db: Firestore,
  uid: string,
  mails: QueuedMail[],
  nowMs: number = Date.now()
): Promise<void> {
  if (mails.length === 0) return;
  const reservation = await db.runTransaction(async (txn) => {
    const reserved = await reserveGroupMail(txn, db, uid, mails.length, nowMs);
    if (!reserved.ok) return reserved;
    for (const mail of mails) {
      txn.create(db.collection('mail').doc(), {
        to: mail.to,
        message: mail.message,
      });
    }
    return reserved;
  });
  if (!reservation.ok) throw groupMailLimitError(reservation.used);
}

/**
 * Nightly cleanup (index.ts deleteOldPaidExpenses): deletes the counters
 * whose every bucket has ended, skipping any a send renewed after the query
 * (review M4). Returns how many it deleted.
 */
export async function deleteExpiredGroupMailLimits(
  nowMs: number = Date.now()
): Promise<number> {
  const snap = await getFirestore()
    .collection(GROUP_MAIL_LIMITS)
    .where('expiresAt', '<=', Timestamp.fromMillis(nowMs))
    .get();
  return deleteDocsIfUnchanged(snap.docs);
}
