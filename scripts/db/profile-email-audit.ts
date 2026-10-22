/**
 * Finds and fixes `users/{uid}` profile emails that an account never verified
 * (Plan 4 task B14). Invited members are linked to accounts by the profile
 * email (`users.emailLower`: member.service's lookups, repairOrphanedMembers,
 * queries/link-orphaned-members.ts). Since B14 the rules and every writer
 * store only '' or the account's verified address, but profiles written
 * before then can still hold an unverified or foreign address, which those
 * lookups would match.
 *
 * The decisions are pure functions (planProfileFixes, planMemberReview,
 * planApply, checkApplySafety), tested without emulators by
 * scripts/db/profile-email-audit.test.mjs. The I/O wrappers below them
 * (auditProfileEmails, applyProfileEmailFixes) take the Admin SDK handles
 * from the caller, so the production query
 * (queries/clear-unverified-profile-emails.ts, via lib.ts) and an emulator
 * check share this code. The profile rule is imported from the server copy,
 * never copied.
 *
 * It never touches Auth accounts, and never changes member docs: linked
 * members whose email isn't their account's verified address are only listed
 * for review, because a script can't tell a legitimate admin link from a
 * past hijack.
 */
import type { Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore';
import {
  normalizeEmail,
  profileEmail,
} from '../../functions/src/email-identity.ts';
import { ChunkedBatch } from './chunked-batch.ts';

export type ProfileEmailReason =
  | 'no-auth-user'
  | 'unverified'
  | 'foreign'
  | 'lower-mismatch';

/** The parts of an Auth UserRecord the audit reads. */
export interface AuthUserLike {
  email?: string;
  emailVerified: boolean;
}

/** A users doc as scanned (raw stored values). */
export interface ProfileRow {
  uid: string;
  email: unknown;
  emailLower: unknown;
}

/** A linked member as scanned. */
export interface MemberRow {
  path: string;
  linkedUid: string;
  email: unknown;
  emailLower: unknown;
}

export interface ProfileEmailFix {
  uid: string;
  reasons: ProfileEmailReason[];
  /** The stored values when scanned. */
  email: string;
  emailLower: string;
  authEmail: string;
  authVerified: boolean | null;
  /** The account's verified address, or '' (what `--apply` stores). */
  target: string;
}

export interface MemberReviewRow {
  memberPath: string;
  linkedUid: string;
  memberEmail: string;
  authEmail: string;
  authVerified: boolean | null;
}

export interface ProfileEmailAudit {
  fixes: ProfileEmailFix[];
  reviewMembers: MemberReviewRow[];
  /** Auth accounts listed, and users docs scanned (for checkApplySafety). */
  authUserCount: number;
  profileCount: number;
}

/** A stored value as a string ('' for missing or null; others stringified). */
export function stored(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Why a profile's stored email/emailLower must change, or [] when it is
 * already what the account may store.
 */
export function profileEmailReasons(
  email: string,
  emailLower: string,
  authUser: AuthUserLike | undefined
): ProfileEmailReason[] {
  if (!email && !emailLower) return [];
  const reasons: ProfileEmailReason[] = [];
  if (!authUser) {
    reasons.push('no-auth-user');
  } else if (authUser.emailVerified !== true) {
    reasons.push('unverified');
  } else if (normalizeEmail(email) !== normalizeEmail(authUser.email ?? '')) {
    reasons.push('foreign');
  }
  if (emailLower && emailLower !== normalizeEmail(email)) {
    reasons.push('lower-mismatch');
  }
  return reasons;
}

function isNonUser(
  user: AuthUserLike | undefined,
  nonUserAuthEmails: ReadonlySet<string>
): boolean {
  return !!user?.email && nonUserAuthEmails.has(normalizeEmail(user.email));
}

/** Every profile to fix, with its reasons and target. */
export function planProfileFixes(
  profiles: ProfileRow[],
  authUsers: ReadonlyMap<string, AuthUserLike>,
  nonUserAuthEmails: ReadonlySet<string>
): ProfileEmailFix[] {
  const fixes: ProfileEmailFix[] = [];
  for (const profile of profiles) {
    const authUser = authUsers.get(profile.uid);
    if (isNonUser(authUser, nonUserAuthEmails)) continue;
    const email = stored(profile.email);
    const emailLower = stored(profile.emailLower);
    const reasons = profileEmailReasons(email, emailLower, authUser);
    if (reasons.length === 0) continue;
    fixes.push({
      uid: profile.uid,
      reasons,
      email,
      emailLower,
      authEmail: authUser?.email ?? '',
      authVerified: authUser ? authUser.emailVerified : null,
      target: authUser ? profileEmail(authUser) : '',
    });
  }
  return fixes;
}

/** Linked members whose email isn't their account's verified address. */
export function planMemberReview(
  members: MemberRow[],
  authUsers: ReadonlyMap<string, AuthUserLike>
): MemberReviewRow[] {
  const rows: MemberReviewRow[] = [];
  for (const member of members) {
    const memberEmail = stored(member.email);
    const memberLower = stored(member.emailLower) || normalizeEmail(memberEmail);
    if (!memberLower) continue;
    const authUser = authUsers.get(member.linkedUid);
    const verified = authUser ? normalizeEmail(profileEmail(authUser)) : '';
    if (memberLower === verified) continue;
    rows.push({
      memberPath: member.path,
      linkedUid: member.linkedUid,
      memberEmail,
      authEmail: authUser?.email ?? '',
      authVerified: authUser ? authUser.emailVerified : null,
    });
  }
  return rows;
}

// --apply refuses an audit that looks like the wrong Auth backend (e.g. an
// emulator with few users against production Firestore) unless overridden.
export const NO_AUTH_USER_MAX_COUNT = 25;
export const NO_AUTH_USER_MAX_SHARE = 0.05;

export type ApplySafety = { ok: true } | { ok: false; reason: string };

/**
 * Whether `--apply` may write. Zero Auth accounts is never plausible, and is
 * refused even with `force`. More `no-auth-user` profiles than
 * NO_AUTH_USER_MAX_COUNT, or than NO_AUTH_USER_MAX_SHARE of all profiles, is
 * refused unless `force` (the owner checked the dry run's list).
 */
export function checkApplySafety(
  audit: Pick<ProfileEmailAudit, 'fixes' | 'authUserCount' | 'profileCount'>,
  force: boolean
): ApplySafety {
  if (audit.authUserCount === 0) {
    return {
      ok: false,
      reason:
        'Auth returned zero users: this is not the production Auth backend (check for an ' +
        'emulator variable or the wrong credentials). Not overridable.',
    };
  }
  const noAuth = audit.fixes.filter((f) => f.reasons.includes('no-auth-user')).length;
  const share = audit.profileCount > 0 ? noAuth / audit.profileCount : 0;
  if (
    !force &&
    (noAuth > NO_AUTH_USER_MAX_COUNT || share > NO_AUTH_USER_MAX_SHARE)
  ) {
    return {
      ok: false,
      reason:
        `${noAuth} of ${audit.profileCount} profiles (${(share * 100).toFixed(1)}%) have no Auth ` +
        `account, over the limit (${NO_AUTH_USER_MAX_COUNT} profiles or ` +
        `${NO_AUTH_USER_MAX_SHARE * 100}%). That usually means Auth was read from the wrong ` +
        'backend. If the dry-run list is genuinely right, re-run with --force-threshold.',
    };
  }
  return { ok: true };
}

/** A users doc as re-read just before applying. */
export interface CurrentProfile {
  exists: boolean;
  email?: unknown;
  emailLower?: unknown;
}

export interface PlannedUpdate {
  uid: string;
  email: string;
  /** null: delete the field. */
  emailLower: string | null;
}

/**
 * The writes for `fixes`, given each doc as it is now. A doc deleted, or
 * whose email/emailLower changed since the scan (a live session sync), is
 * skipped. `emailLower` is written explicitly (deleted for '') so the result
 * doesn't wait on the syncUserEmailLower trigger.
 */
export function planApply(
  fixes: ProfileEmailFix[],
  current: ReadonlyMap<string, CurrentProfile>
): { updates: PlannedUpdate[]; skipped: { uid: string; reason: string }[] } {
  const updates: PlannedUpdate[] = [];
  const skipped: { uid: string; reason: string }[] = [];
  for (const fix of fixes) {
    const doc = current.get(fix.uid);
    if (!doc?.exists) {
      skipped.push({ uid: fix.uid, reason: 'doc deleted since the scan' });
      continue;
    }
    if (stored(doc.email) !== fix.email || stored(doc.emailLower) !== fix.emailLower) {
      skipped.push({ uid: fix.uid, reason: 'email changed since the scan' });
      continue;
    }
    updates.push({
      uid: fix.uid,
      email: fix.target,
      emailLower: fix.target ? normalizeEmail(fix.target) : null,
    });
  }
  return { updates, skipped };
}

// ---------------------------------------------------------------------------
// I/O wrappers
// ---------------------------------------------------------------------------

async function listAuthUsers(auth: Auth): Promise<Map<string, AuthUserLike>> {
  const users = new Map<string, AuthUserLike>();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken); // NOSONAR - each page needs the previous token
    for (const user of page.users) {
      users.set(user.uid, { email: user.email, emailVerified: user.emailVerified });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

/** Read-only: every profile to fix, and every linked member to review. */
export async function auditProfileEmails(
  db: Firestore,
  auth: Auth,
  nonUserAuthEmails: ReadonlySet<string>
): Promise<ProfileEmailAudit> {
  const authUsers = await listAuthUsers(auth);

  const usersSnap = await db.collection('users').select('email', 'emailLower').get();
  const profiles: ProfileRow[] = usersSnap.docs.map((d) => ({
    uid: d.id,
    email: d.get('email'),
    emailLower: d.get('emailLower'),
  }));

  const membersSnap = await db
    .collectionGroup('members')
    .where('userRef', '!=', null)
    .get();
  const members: MemberRow[] = membersSnap.docs.map((d) => ({
    path: d.ref.path,
    linkedUid: (d.get('userRef') as DocumentReference).id,
    email: d.get('email'),
    emailLower: d.get('emailLower'),
  }));

  return {
    fixes: planProfileFixes(profiles, authUsers, nonUserAuthEmails),
    reviewMembers: planMemberReview(members, authUsers),
    authUserCount: authUsers.size,
    profileCount: profiles.length,
  };
}

export interface ApplyResult {
  applied: number;
  skipped: { uid: string; reason: string }[];
}

/**
 * Re-reads each doc, then writes planApply's updates through ChunkedBatch.
 * Each update carries the re-read's `lastUpdateTime` as a precondition, so a
 * doc that changes between the re-read and the commit fails its batch rather
 * than being overwritten. On a failed batch the error says how many writes
 * had already committed (earlier batches stay committed; re-running re-scans
 * and picks up the rest).
 */
export async function applyProfileEmailFixes(
  db: Firestore,
  fixes: ProfileEmailFix[]
): Promise<ApplyResult> {
  const current = new Map<string, CurrentProfile>();
  const updateTimes = new Map<string, Timestamp>();
  const refs = fixes.map((f) => db.collection('users').doc(f.uid));
  const chunks: DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += 300) chunks.push(refs.slice(i, i + 300));
  const snaps = (await Promise.all(chunks.map((c) => db.getAll(...c)))).flat();
  for (const snap of snaps) {
    current.set(snap.id, {
      exists: snap.exists,
      email: snap.get('email'),
      emailLower: snap.get('emailLower'),
    });
    if (snap.updateTime) updateTimes.set(snap.id, snap.updateTime);
  }

  const { updates, skipped } = planApply(fixes, current);
  const batch = new ChunkedBatch(db);
  for (const u of updates) {
    batch.update(
      db.collection('users').doc(u.uid),
      {
        email: u.email,
        emailLower: u.emailLower ?? FieldValue.delete(),
      },
      { lastUpdateTime: updateTimes.get(u.uid)! }
    );
  }
  try {
    await batch.commit();
  } catch (error) {
    throw new Error(
      `Stopped after ${batch.committed} of ${updates.length} writes committed ` +
        `(${skipped.length} skipped): ${error instanceof Error ? error.message : String(error)}. ` +
        'Re-run the dry run to see what is left.',
      { cause: error }
    );
  }
  return { applied: updates.length, skipped };
}
