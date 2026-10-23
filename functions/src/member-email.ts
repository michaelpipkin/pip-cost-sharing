import { createHash, randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import {
  DocumentReference,
  getFirestore,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { APP_BASE_URL, callableAppCheck, normalizeEmail } from './common';
import { buildEmailHtml, escapeHtml, isSingleEmailAddress } from './email-builders';

// ---------------------------------------------------------------------------
// Verified group emails (Plan 4 B19). All group mail goes to the member's
// group email (groups/{gid}/members/{mid}.email), so a LINKED member's email
// must always be an address the linked user has proven they own
// (group-mail-recipient.ts). firestore.rules lets a member write their own
// linked email only when it is their verified sign-in address; any other
// address goes through these two callables:
//  - requestMemberEmailChange: the member asks for a new group email. Their
//    verified sign-in address is applied at once; any other address gets a
//    one-time confirmation link, mailed to that address.
//  - confirmMemberEmailChange: the link's page (/auth/confirm-group-email)
//    applies the address, once, for the account that asked.
// The confirmation mail holds no user-controlled text (no display name,
// group name or other address): the request can name any address, so
// anything the caller controls in the mail would make this a spam relay
// (Ruling R18). Requests are capped per uid (EMAIL_CHANGE_LIMIT per fixed
// window) for the same reason.
//
// getFirestore() is called inside each handler rather than at module scope:
// index.ts imports (and so evaluates) this module before it calls
// initializeApp(), the same constraint as group-emails.ts.
// ---------------------------------------------------------------------------

/** Pending confirmations, keyed by sha256(token). Server-only (rules deny all). */
export const MEMBER_EMAIL_TOKENS = 'memberEmailChangeTokens';
/** Per-uid request counters. Server-only (rules deny all). */
export const MEMBER_EMAIL_LIMITS = 'memberEmailChangeLimits';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Requests that mail a link, per uid per fixed window. */
export const EMAIL_CHANGE_LIMIT = 5;
export const EMAIL_CHANGE_WINDOW_MS = DAY_MS;
/** How long a confirmation link works. */
export const EMAIL_CHANGE_TOKEN_TTL_MS = DAY_MS;

/**
 * The stable failed-precondition messages the confirm page tells apart
 * (src/app/features/auth/confirm-group-email).
 */
export const CONFIRM_LINK_INVALID =
  'This link has expired or was already used.';
export const CONFIRM_MEMBER_UNLINKED =
  'This group membership is no longer linked to your account.';

export const DUPLICATE_MEMBER_EMAIL =
  'A member with this email address already exists in the group.';
/** permission-denied: the caller's own login email is not verified. */
export const VERIFY_LOGIN_EMAIL = 'Verify your login email first.';
/** permission-denied: the token belongs to another account. */
export const CONFIRM_WRONG_ACCOUNT =
  'Sign in with the account that requested this change.';
/** permission-denied: the caller's membership is not active (group-emails.ts). */
export const NOT_ACTIVE_MEMBER = 'User must be an active member of the group';

export type MemberEmailChangeStatus = 'unchanged' | 'updated' | 'pending';

/** The token's doc id: its sha256, hex. The token itself is never stored. */
export function hashEmailChangeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function emailChangeConfirmLink(token: string): string {
  return `${APP_BASE_URL}/auth/confirm-group-email?token=${encodeURIComponent(token)}`;
}

/**
 * The confirmation mail. Takes only the link: no display name, group name
 * or any address but the recipient's may appear in it (see the header).
 */
export function buildMemberEmailConfirmationEmail(link: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Confirm your email address for PipSplit';
  const text = [
    'Someone asked to use this address for a group on PipSplit. If that was you, confirm it here:',
    link,
    '',
    'If not, ignore this email; nothing will change.',
    '',
    'The link works once and expires in 24 hours.',
  ].join('\n');
  const html = buildEmailHtml(
    `<h2 style="color:#105208;margin:0 0 20px 0;">Confirm your email address</h2>` +
      `<p style="margin:0 0 16px 0;">Someone asked to use this address for a group on PipSplit. If that was you, confirm it here:</p>` +
      `<p style="margin:0 0 20px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background-color:#105208;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Confirm email address</a></p>` +
      `<p style="margin:0 0 16px 0;">If not, ignore this email; nothing will change.</p>` +
      `<p style="margin:0;color:#5b6058;font-size:13px;">The link works once and expires in 24 hours.</p>`,
    'You received this email because this address was entered for a group on PipSplit.'
  );
  return { subject, text, html };
}

function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  return uid;
}

/** A usable single document id (no `/`, not a reserved id). */
function isDocId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1500 &&
    !value.includes('/') &&
    !/^\.\.?$|^__.*__$/.test(value)
  );
}

function isLinkedTo(member: DocumentData | undefined, uid: string): boolean {
  const userRef: unknown = member?.['userRef'];
  return userRef instanceof DocumentReference && userRef.path === `users/${uid}`;
}

/**
 * Only an active member may change (or confirm) their group email: someone
 * who left has no access to the group's data (firestore.rules), so they must
 * not be able to probe its addresses here either. Same code and message as
 * group-emails.ts requireActiveMember.
 */
function assertActive(member: DocumentData | undefined): void {
  if (member?.['active'] !== true) {
    throw new HttpsError('permission-denied', NOT_ACTIVE_MEMBER);
  }
}

/**
 * The caller's verified Auth address, lowercased. Refuses an unverified (or
 * missing) account: uids are free, so without this the per-uid limit would
 * not bound the mail an attacker could send (fix round 1, I1). The app's
 * confirm page is behind authGuard, which requires a verified account too.
 */
async function requireVerifiedCaller(uid: string): Promise<string> {
  const emailLower = await verifiedAuthEmailLower(uid);
  if (!emailLower) {
    throw new HttpsError('permission-denied', VERIFY_LOGIN_EMAIL);
  }
  return emailLower;
}

/** The member's pending confirmation tokens, read inside `txn`. */
async function pendingTokensOf(
  txn: Transaction,
  memberRef: DocumentReference
): Promise<DocumentReference[]> {
  const snap = await txn.get(
    getFirestore()
      .collection(MEMBER_EMAIL_TOKENS)
      .where('memberRef', '==', memberRef)
  );
  return snap.docs.map((d) => d.ref);
}

/** The caller's Auth address when it is verified, lowercased; else null. */
async function verifiedAuthEmailLower(uid: string): Promise<string | null> {
  try {
    const record = await getAuth().getUser(uid);
    return record.emailVerified && record.email
      ? normalizeEmail(record.email)
      : null;
  } catch {
    return null;
  }
}

/**
 * Refuses an address another member of the same group already has (the
 * app's own duplicate check, member.service updateMember). `read` runs the
 * query: a transaction's get inside one, else a plain get.
 */
async function assertNoOtherMemberHas(
  read: (query: Query) => Promise<QuerySnapshot>,
  memberRef: DocumentReference,
  emailLower: string
): Promise<void> {
  const clash = await read(
    memberRef.parent.where('emailLower', '==', emailLower).limit(2)
  );
  if (clash.docs.some((d) => d.id !== memberRef.id)) {
    throw new HttpsError('already-exists', DUPLICATE_MEMBER_EMAIL);
  }
}

/** Counts one mailed request against the caller's window, or refuses it. */
async function consumeRequestAllowance(
  db: Firestore,
  uid: string,
  nowMs: number
): Promise<void> {
  const limitRef = db.collection(MEMBER_EMAIL_LIMITS).doc(uid);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(limitRef);
    const windowStart = snap.get('windowStart') as Timestamp | undefined;
    const count = (snap.get('count') as number | undefined) ?? 0;
    if (
      !snap.exists ||
      !(windowStart instanceof Timestamp) ||
      nowMs - windowStart.toMillis() >= EMAIL_CHANGE_WINDOW_MS
    ) {
      txn.set(limitRef, {
        windowStart: Timestamp.fromMillis(nowMs),
        count: 1,
      });
      return;
    }
    if (count >= EMAIL_CHANGE_LIMIT) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many email change requests. Please try again tomorrow.'
      );
    }
    txn.update(limitRef, { count: count + 1 });
  });
}

/**
 * Edit-member's email change on one's own linked row. Returns:
 *  - unchanged: the address (case-insensitively) is the current one;
 *  - updated: it is the caller's verified sign-in address, written now;
 *  - pending: a confirmation link was mailed to it; nothing changes until
 *    the link is used. Each new request replaces the member's earlier link.
 * The caller must be verified (VERIFY_LOGIN_EMAIL) and an active member
 * (NOT_ACTIVE_MEMBER), both permission-denied.
 */
export const requestMemberEmailChange = onCall<{
  groupId?: unknown;
  memberId?: unknown;
  email?: unknown;
}>(
  callableAppCheck,
  async (request): Promise<{ status: MemberEmailChangeStatus }> => {
    const uid = requireUid(request.auth?.uid);
    const verifiedLower = await requireVerifiedCaller(uid);
    const { groupId, memberId, email } = request.data ?? {};
    if (!isSingleEmailAddress(email)) {
      throw new HttpsError(
        'invalid-argument',
        'A single valid email address is required'
      );
    }
    if (!isDocId(groupId) || !isDocId(memberId)) {
      throw new HttpsError('permission-denied', 'Not your member record');
    }

    const db = getFirestore();
    const memberRef = db
      .collection('groups')
      .doc(groupId)
      .collection('members')
      .doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists || !isLinkedTo(memberSnap.data(), uid)) {
      throw new HttpsError('permission-denied', 'Not your member record');
    }
    assertActive(memberSnap.data());

    const emailLower = normalizeEmail(email);
    const current: unknown = memberSnap.get('email');
    if (typeof current === 'string' && normalizeEmail(current) === emailLower) {
      return { status: 'unchanged' };
    }

    if (verifiedLower === emailLower) {
      // Applied at once; any link still pending is cancelled with it, so
      // an older mail can't revert the address later (M1).
      await db.runTransaction(async (txn) => {
        const fresh = await txn.get(memberRef);
        if (!isLinkedTo(fresh.data(), uid)) {
          throw new HttpsError('permission-denied', 'Not your member record');
        }
        assertActive(fresh.data());
        await assertNoOtherMemberHas((q) => txn.get(q), memberRef, emailLower);
        const earlier = await pendingTokensOf(txn, memberRef);
        for (const ref of earlier) txn.delete(ref);
        txn.update(memberRef, { email, emailLower });
      });
      return { status: 'updated' };
    }

    // The allowance comes first, so every mailed or refused attempt
    // (a duplicate address included) counts against it (M2).
    const nowMs = Date.now();
    await consumeRequestAllowance(db, uid, nowMs);

    const token = randomBytes(32).toString('base64url');
    const tokenRef = db
      .collection(MEMBER_EMAIL_TOKENS)
      .doc(hashEmailChangeToken(token));
    const mailRef = db.collection('mail').doc();
    // One transaction, so two concurrent requests can't both leave a live
    // link behind (M1): the earlier tokens are read and deleted with the
    // new one's creation.
    await db.runTransaction(async (txn) => {
      await assertNoOtherMemberHas((q) => txn.get(q), memberRef, emailLower);
      const earlier = await pendingTokensOf(txn, memberRef);
      for (const ref of earlier) txn.delete(ref);
      txn.set(tokenRef, {
        uid,
        memberRef,
        email,
        emailLower,
        createdAt: Timestamp.fromMillis(nowMs),
        expiresAt: Timestamp.fromMillis(nowMs + EMAIL_CHANGE_TOKEN_TTL_MS),
      });
      txn.set(mailRef, {
        to: email,
        message: buildMemberEmailConfirmationEmail(
          emailChangeConfirmLink(token)
        ),
      });
    });
    return { status: 'pending' };
  }
);

/**
 * The confirmation link's page. Applies the requested address to the member
 * doc and deletes the token, in one transaction, so a link works once.
 * Errors, each with a stable message the confirm page maps:
 *  - failed-precondition: CONFIRM_LINK_INVALID (unknown, used or expired),
 *    CONFIRM_MEMBER_UNLINKED (the member is no longer the caller's);
 *  - permission-denied: VERIFY_LOGIN_EMAIL (the caller is not verified),
 *    CONFIRM_WRONG_ACCOUNT (another account asked for it),
 *    NOT_ACTIVE_MEMBER (the caller left the group);
 *  - already-exists: DUPLICATE_MEMBER_EMAIL (another member took it).
 */
export const confirmMemberEmailChange = onCall<{ token?: unknown }>(
  callableAppCheck,
  async (request): Promise<{ groupId: string; email: string }> => {
    const uid = requireUid(request.auth?.uid);
    await requireVerifiedCaller(uid);
    const token = request.data?.token;
    if (typeof token !== 'string' || token.length === 0 || token.length > 512) {
      throw new HttpsError('failed-precondition', CONFIRM_LINK_INVALID);
    }

    const db = getFirestore();
    const tokenRef = db
      .collection(MEMBER_EMAIL_TOKENS)
      .doc(hashEmailChangeToken(token));
    return db.runTransaction(async (txn) => {
      const tokenSnap = await txn.get(tokenRef);
      const expiresAt = tokenSnap.get('expiresAt') as Timestamp | undefined;
      if (
        !tokenSnap.exists ||
        !(expiresAt instanceof Timestamp) ||
        expiresAt.toMillis() <= Date.now()
      ) {
        throw new HttpsError('failed-precondition', CONFIRM_LINK_INVALID);
      }
      if (tokenSnap.get('uid') !== uid) {
        throw new HttpsError('permission-denied', CONFIRM_WRONG_ACCOUNT);
      }
      const memberRef = tokenSnap.get('memberRef') as DocumentReference;
      const email = tokenSnap.get('email') as string;
      const emailLower = tokenSnap.get('emailLower') as string;
      const memberSnap = await txn.get(memberRef);
      if (!memberSnap.exists || !isLinkedTo(memberSnap.data(), uid)) {
        throw new HttpsError('failed-precondition', CONFIRM_MEMBER_UNLINKED);
      }
      assertActive(memberSnap.data());
      await assertNoOtherMemberHas((q) => txn.get(q), memberRef, emailLower);
      txn.update(memberRef, { email, emailLower });
      txn.delete(tokenRef);
      return { groupId: memberRef.parent.parent!.id, email };
    });
  }
);

/**
 * Nightly cleanup (index.ts deleteOldPaidExpenses): deletes expired
 * confirmation tokens and rate-limit docs whose window has ended. Returns
 * how many of each it deleted.
 */
export async function deleteExpiredMemberEmailChanges(
  nowMs: number = Date.now()
): Promise<{ tokens: number; limits: number }> {
  const db = getFirestore();
  const deleteAll = async (query: Query): Promise<number> => {
    const snap = await query.get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    return snap.size;
  };
  const tokens = await deleteAll(
    db
      .collection(MEMBER_EMAIL_TOKENS)
      .where('expiresAt', '<=', Timestamp.fromMillis(nowMs))
  );
  const limits = await deleteAll(
    db
      .collection(MEMBER_EMAIL_LIMITS)
      .where(
        'windowStart',
        '<=',
        Timestamp.fromMillis(nowMs - EMAIL_CHANGE_WINDOW_MS)
      )
  );
  return { tokens, limits };
}
