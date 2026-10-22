/**
 * Finds and fixes `users/{uid}` profile emails that an account never verified
 * (Plan 4 task B14). Invited members are linked to accounts by the profile
 * email (`users.emailLower`: member.service's lookups, repairOrphanedMembers,
 * queries/link-orphaned-members.ts). Since B14 the rules and every writer
 * store only '' or the account's verified address, but profiles written
 * before then can still hold an unverified or foreign address, which those
 * lookups would match.
 *
 * Side-effect free: the Admin SDK handles come from the caller, so the
 * production query (queries/clear-unverified-profile-emails.ts, via lib.ts)
 * and an emulator check share this code. The profile rule is imported from
 * the server copy, never copied.
 *
 * It never touches Auth accounts, and never changes member docs: linked
 * members whose email isn't their account's verified address are only listed
 * for review, because a script can't tell a legitimate admin link from a
 * past hijack.
 */
import type { Auth, UserRecord } from 'firebase-admin/auth';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
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
}

/** A stored value as a string ('' for missing or null; others stringified). */
function stored(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function authUsersByUid(auth: Auth): Promise<Map<string, UserRecord>> {
  const users = new Map<string, UserRecord>();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) users.set(user.uid, user);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

/**
 * Why a profile's stored email/emailLower must change, or [] when it is
 * already what the account may store. Exported for tests.
 */
export function profileEmailReasons(
  email: string,
  emailLower: string,
  authUser: UserRecord | undefined
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

/** Read-only: every profile to fix, and every linked member to review. */
export async function auditProfileEmails(
  db: Firestore,
  auth: Auth,
  nonUserAuthEmails: ReadonlySet<string>
): Promise<ProfileEmailAudit> {
  const authUsers = await authUsersByUid(auth);
  const isNonUser = (user: UserRecord | undefined) =>
    !!user?.email && nonUserAuthEmails.has(normalizeEmail(user.email));

  const fixes: ProfileEmailFix[] = [];
  const usersSnap = await db.collection('users').select('email', 'emailLower').get();
  for (const d of usersSnap.docs) {
    const authUser = authUsers.get(d.id);
    if (isNonUser(authUser)) continue;
    const email = stored(d.get('email'));
    const emailLower = stored(d.get('emailLower'));
    const reasons = profileEmailReasons(email, emailLower, authUser);
    if (reasons.length === 0) continue;
    fixes.push({
      uid: d.id,
      reasons,
      email,
      emailLower,
      authEmail: authUser?.email ?? '',
      authVerified: authUser ? authUser.emailVerified : null,
      target: authUser ? profileEmail(authUser) : '',
    });
  }

  const reviewMembers: MemberReviewRow[] = [];
  const membersSnap = await db
    .collectionGroup('members')
    .where('userRef', '!=', null)
    .get();
  for (const d of membersSnap.docs) {
    const memberEmail = stored(d.get('email'));
    const memberLower = stored(d.get('emailLower')) || normalizeEmail(memberEmail);
    if (!memberLower) continue;
    const linkedUid = (d.get('userRef') as DocumentReference).id;
    const authUser = authUsers.get(linkedUid);
    const verified = authUser ? normalizeEmail(profileEmail(authUser)) : '';
    if (memberLower === verified) continue;
    reviewMembers.push({
      memberPath: d.ref.path,
      linkedUid,
      memberEmail,
      authEmail: authUser?.email ?? '',
      authVerified: authUser ? authUser.emailVerified : null,
    });
  }

  return { fixes, reviewMembers };
}

export interface ApplyResult {
  applied: number;
  skipped: { uid: string; reason: string }[];
}

/**
 * Stores each fix's target: `email` = the verified address or '', and a
 * matching `emailLower` (deleted for ''), written explicitly so the result
 * doesn't wait on the syncUserEmailLower trigger. A doc whose email or
 * emailLower changed since the scan (a live session sync) is skipped.
 */
export async function applyProfileEmailFixes(
  db: Firestore,
  fixes: ProfileEmailFix[]
): Promise<ApplyResult> {
  const skipped: ApplyResult['skipped'] = [];
  const batch = new ChunkedBatch(db);
  let applied = 0;

  const refs = fixes.map((f) => db.collection('users').doc(f.uid));
  for (let i = 0; i < refs.length; i += 300) {
    const chunk = refs.slice(i, i + 300);
    const snaps = chunk.length > 0 ? await db.getAll(...chunk) : [];
    snaps.forEach((snap, j) => {
      const fix = fixes[i + j]!;
      if (!snap.exists) {
        skipped.push({ uid: fix.uid, reason: 'doc deleted since the scan' });
        return;
      }
      if (
        stored(snap.get('email')) !== fix.email ||
        stored(snap.get('emailLower')) !== fix.emailLower
      ) {
        skipped.push({ uid: fix.uid, reason: 'email changed since the scan' });
        return;
      }
      batch.update(snap.ref, {
        email: fix.target,
        emailLower: fix.target ? normalizeEmail(fix.target) : FieldValue.delete(),
      });
      applied++;
    });
  }

  await batch.commit();
  return { applied, skipped };
}
