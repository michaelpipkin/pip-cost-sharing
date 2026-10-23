import { createHash, randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import {
  DocumentReference,
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
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
// (group-mail-recipient.ts). firestore.rules lets no client change a linked
// member's email at all; every change goes through these callables:
//  - requestMemberEmailChange: the member asks for a new group email. Their
//    verified sign-in address is applied at once; any other address gets a
//    one-time confirmation link, mailed to that address.
//  - confirmMemberEmailChange: the link's page (/auth/confirm-group-email)
//    applies the address, once, for the account that asked.
//  - updateMemberEmails: Account > Profile's Sync and the "Update your group
//    emails?" dialog move every linked membership to the verified sign-in
//    address, with the same duplicate check and link cancellation.
// The confirmation mail holds no user-controlled text (no display name,
// group name or other address): the request can name any address, so
// anything the caller controls in the mail would make this a spam relay
// (Ruling R18). Requests are capped per uid (EMAIL_CHANGE_LIMIT per fixed
// window) for the same reason, and per recipient (one confirmation mail per
// address per RECIPIENT_COOLDOWN_MS, from any caller), so throwaway accounts
// can't multiply the per-uid cap against one address.
//
// getFirestore() is called inside each handler rather than at module scope:
// index.ts imports (and so evaluates) this module before it calls
// initializeApp(), the same constraint as group-emails.ts.
// ---------------------------------------------------------------------------

/** Pending confirmations, keyed by sha256(token). Server-only (rules deny all). */
export const MEMBER_EMAIL_TOKENS = 'memberEmailChangeTokens';
/** Per-uid request counters. Server-only (rules deny all). */
export const MEMBER_EMAIL_LIMITS = 'memberEmailChangeLimits';
/**
 * Per-recipient cooldowns, keyed by sha256 of the lowercased address so no
 * raw address is a doc id: { sentAt, expiresAt }. Server-only (rules deny
 * all). The nightly cleanup deletes ended ones; a Firestore TTL policy on
 * expiresAt could do the same (not configured in production).
 */
export const MEMBER_EMAIL_RECIPIENT_COOLDOWNS = 'memberEmailRecipientCooldown';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Requests that mail a link, per uid per fixed window. */
export const EMAIL_CHANGE_LIMIT = 5;
export const EMAIL_CHANGE_WINDOW_MS = DAY_MS;
/** How long a confirmation link works. */
export const EMAIL_CHANGE_TOKEN_TTL_MS = DAY_MS;
/** One confirmation mail per address per this long, from any caller. */
export const RECIPIENT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * The stable failed-precondition messages the confirm page tells apart
 * (src/app/features/auth/confirm-group-email).
 */
export const CONFIRM_LINK_INVALID =
  'This link has expired or was already used.';
export const CONFIRM_MEMBER_UNLINKED =
  'This group membership is no longer linked to your account.';

/** resource-exhausted: the address got a confirmation mail within the hour. */
export const CONFIRMATION_RECENTLY_SENT =
  'A confirmation email was sent to that address recently. Try again in an hour.';

export const DUPLICATE_MEMBER_EMAIL =
  'A member with this email address already exists in the group.';
/** permission-denied: the caller's own login email is not verified. */
export const VERIFY_LOGIN_EMAIL = 'Verify your login email first.';
/**
 * failed-precondition (updateMemberEmails): the verified login email is not
 * one valid address (a legacy account), so no member doc may hold it. The
 * app matches this text (src/app/utilities/callable-error.util.ts).
 */
export const LOGIN_EMAIL_INVALID =
  'Your login email is not a single valid email address.';
/** permission-denied: the token belongs to another account. */
export const CONFIRM_WRONG_ACCOUNT =
  'Sign in with the account that requested this change.';
/** permission-denied: the caller's membership is not active (group-emails.ts). */
export const NOT_ACTIVE_MEMBER = 'User must be an active member of the group';

export type MemberEmailChangeStatus = 'unchanged' | 'updated' | 'pending';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The token's doc id: its sha256, hex. The token itself is never stored. */
export function hashEmailChangeToken(token: string): string {
  return sha256Hex(token);
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
 * The caller's verified Auth address, as stored and lowercased. Refuses an
 * unverified (or missing) account: uids are free, so without this the
 * per-uid limit would not bound the mail an attacker could send (fix round
 * 1, I1). The app's confirm page is behind authGuard, which requires a
 * verified account too.
 */
async function requireVerifiedCaller(
  uid: string
): Promise<{ email: string; emailLower: string }> {
  const email = await verifiedAuthEmail(uid);
  if (!email) {
    throw new HttpsError('permission-denied', VERIFY_LOGIN_EMAIL);
  }
  return { email, emailLower: normalizeEmail(email) };
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

/** The caller's Auth address (as stored) when it is verified; else null. */
async function verifiedAuthEmail(uid: string): Promise<string | null> {
  try {
    const record = await getAuth().getUser(uid);
    return record.emailVerified && record.email ? record.email : null;
  } catch {
    return null;
  }
}

/**
 * Whether another member of the same group already has the address (the
 * app's own duplicate check, member.service updateMember). `read` runs the
 * query: a transaction's get inside one, else a plain get.
 */
async function otherMemberHas(
  read: (query: Query) => Promise<QuerySnapshot>,
  memberRef: DocumentReference,
  emailLower: string
): Promise<boolean> {
  const clash = await read(
    memberRef.parent.where('emailLower', '==', emailLower).limit(2)
  );
  return clash.docs.some((d) => d.id !== memberRef.id);
}

/** Refuses an address another member of the same group already has. */
async function assertNoOtherMemberHas(
  read: (query: Query) => Promise<QuerySnapshot>,
  memberRef: DocumentReference,
  emailLower: string
): Promise<void> {
  if (await otherMemberHas(read, memberRef, emailLower)) {
    throw new HttpsError('already-exists', DUPLICATE_MEMBER_EMAIL);
  }
}

/** The address's cooldown doc: sha256 of the lowercased address. */
function recipientCooldownRef(
  db: Firestore,
  emailLower: string
): DocumentReference {
  return db
    .collection(MEMBER_EMAIL_RECIPIENT_COOLDOWNS)
    .doc(sha256Hex(emailLower));
}

/** Refuses an address whose cooldown (if any) has not ended at `nowMs`. */
function assertNotCoolingDown(
  snap: DocumentSnapshot,
  nowMs: number
): void {
  const expiresAt: unknown = snap.get('expiresAt');
  if (expiresAt instanceof Timestamp && expiresAt.toMillis() > nowMs) {
    throw new HttpsError('resource-exhausted', CONFIRMATION_RECENTLY_SENT);
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
    const { emailLower: verifiedLower } = await requireVerifiedCaller(uid);
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

    // The recipient's cooldown is checked before the allowance, so a send
    // it refuses doesn't use up the caller's requests. It is checked again
    // in the transaction below, which also starts it, so two concurrent
    // requests can't both mail the address.
    const nowMs = Date.now();
    const cooldownRef = recipientCooldownRef(db, emailLower);
    assertNotCoolingDown(await cooldownRef.get(), nowMs);

    // The allowance comes next, so every other mailed or refused attempt
    // (a duplicate address included) counts against it (M2).
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
      assertNotCoolingDown(await txn.get(cooldownRef), nowMs);
      const earlier = await pendingTokensOf(txn, memberRef);
      for (const ref of earlier) txn.delete(ref);
      txn.set(cooldownRef, {
        sentAt: Timestamp.fromMillis(nowMs),
        expiresAt: Timestamp.fromMillis(nowMs + RECIPIENT_COOLDOWN_MS),
      });
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
 * Linked rows per updateMemberEmails transaction. Each row costs one update
 * plus the deletes of its pending links (at most one in practice, since each
 * request replaces the member's earlier link), so 100 rows stay far below a
 * commit's 500-write limit. A user realistically has far fewer memberships,
 * so this is one transaction in practice.
 */
export const MEMBER_EMAILS_PER_TXN = 100;

/** The longest `onlyFromEmail` accepted (well past any real address). */
const MAX_FROM_EMAIL_LENGTH = 1000;

/**
 * Account > Profile's Sync and the "Update your group emails?" dialog: moves
 * every member doc linked to the caller (active or not, the app's former
 * client query) to the caller's VERIFIED Auth address, never one the client
 * supplies. Skips, comparing case-insensitively:
 *  - rows already on that address;
 *  - with `onlyFromEmail`, rows whose email is not that address;
 *  - rows whose group already has another member on that address, counted
 *    as `conflicts` (the callables' DUPLICATE_MEMBER_EMAIL check).
 * Each updated row gets `email` and `emailLower`, and its pending
 * confirmation links are deleted with it, so an older link can't put the
 * row back (M1).
 *
 * Atomic: one transaction per MEMBER_EMAILS_PER_TXN rows, which is every row
 * for any real user. Past that, a failure can leave earlier chunks written.
 * That is acceptable because every row is still written whole (email,
 * emailLower and its links together), and a retry skips the rows already on
 * the address.
 *
 * Errors: unauthenticated; permission-denied VERIFY_LOGIN_EMAIL (no verified
 * Auth address); invalid-argument (`onlyFromEmail` not a string);
 * failed-precondition LOGIN_EMAIL_INVALID (the Auth address is not one valid
 * address, which a member doc may not hold).
 */
export const updateMemberEmails = onCall<{ onlyFromEmail?: unknown }>(
  callableAppCheck,
  async (request): Promise<{ updated: number; conflicts: number }> => {
    const uid = requireUid(request.auth?.uid);
    const { email, emailLower } = await requireVerifiedCaller(uid);
    const onlyFromEmail = request.data?.onlyFromEmail ?? null;
    if (
      onlyFromEmail !== null &&
      (typeof onlyFromEmail !== 'string' ||
        onlyFromEmail.length > MAX_FROM_EMAIL_LENGTH)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'onlyFromEmail must be an email address'
      );
    }
    if (!isSingleEmailAddress(email)) {
      throw new HttpsError('failed-precondition', LOGIN_EMAIL_INVALID);
    }
    const fromLower =
      onlyFromEmail === null ? null : normalizeEmail(onlyFromEmail);

    const db = getFirestore();
    const linked = await db
      .collectionGroup('members')
      .where('userRef', '==', db.collection('users').doc(uid))
      .get();
    const refs = linked.docs.map((d) => d.ref);

    let updated = 0;
    let conflicts = 0;
    for (let i = 0; i < refs.length; i += MEMBER_EMAILS_PER_TXN) {
      const chunk = refs.slice(i, i + MEMBER_EMAILS_PER_TXN);
      const result = await db.runTransaction(async (txn) => {
        const snaps = await txn.getAll(...chunk);
        const writes: { ref: DocumentReference; links: DocumentReference[] }[] =
          [];
        // Groups this transaction gives the address to: a second row of the
        // caller's in the same group would be a duplicate the query below
        // can't see yet (the first write is not committed).
        const claimed = new Set<string>();
        let clashes = 0;
        for (const snap of snaps) {
          if (!snap.exists || !isLinkedTo(snap.data(), uid)) continue;
          const stored: unknown = snap.get('email');
          const current = typeof stored === 'string' ? normalizeEmail(stored) : '';
          if (current === emailLower) continue;
          if (fromLower !== null && current !== fromLower) continue;
          const group = snap.ref.parent.path;
          if (
            claimed.has(group) ||
            (await otherMemberHas((q) => txn.get(q), snap.ref, emailLower))
          ) {
            clashes++;
            continue;
          }
          claimed.add(group);
          writes.push({
            ref: snap.ref,
            links: await pendingTokensOf(txn, snap.ref),
          });
        }
        for (const { ref, links } of writes) {
          for (const link of links) txn.delete(link);
          txn.update(ref, { email, emailLower });
        }
        return { updated: writes.length, conflicts: clashes };
      });
      updated += result.updated;
      conflicts += result.conflicts;
    }
    return { updated, conflicts };
  }
);

/**
 * Nightly cleanup (index.ts deleteOldPaidExpenses): deletes expired
 * confirmation tokens, rate-limit docs whose window has ended and ended
 * recipient cooldowns. Returns how many of each it deleted.
 */
export async function deleteExpiredMemberEmailChanges(
  nowMs: number = Date.now()
): Promise<{ tokens: number; limits: number; cooldowns: number }> {
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
  const cooldowns = await deleteAll(
    db
      .collection(MEMBER_EMAIL_RECIPIENT_COOLDOWNS)
      .where('expiresAt', '<=', Timestamp.fromMillis(nowMs))
  );
  return { tokens, limits, cooldowns };
}
