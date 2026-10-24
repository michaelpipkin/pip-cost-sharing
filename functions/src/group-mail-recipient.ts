import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { isSingleEmailAddress } from './email-builders';

// ---------------------------------------------------------------------------
// The one recipient rule for every group mail (Plan 4 B19): payment requests
// and reversal notices (group-emails.ts) and the payment / settle
// notifications (index.ts sendPaymentNotificationEmail).
//
// Group mail goes to the address on the member's GROUP profile
// (groups/{gid}/members/{mid}.email), not the login email: a member may use a
// different address for a group (owner decision, 2026-10-22). That is safe
// because a LINKED member's email is always an address the linked user has
// proven they own (firestore.rules, groups/{gid}/members/{mid}):
//  - it was linked on the server through the verified-address index
//    (member-linking.ts, from syncMemberEmailLower and linkInvitedMembers),
//    which holds only addresses their owner proved;
//  - or it is the creator's own row in addGroup, carrying their verified
//    sign-in address or profile email (the only link a client may write);
//  - or it was confirmed through a link mailed to it
//    (member-email.ts confirmMemberEmailChange), or set to their verified
//    address by updateMemberEmails.
// An unlinked member's email is whatever an admin typed, so unlinked
// members are never mailed here (invites have their own capped path,
// sendGroupInvite).
// ---------------------------------------------------------------------------

export type MemberRecipient =
  { result: 'sent'; to: string } | { result: 'not_registered' | 'opted_out' };

/**
 * Whether the member's userRef names a users/{uid} doc. Rules require it for
 * any client-written link; this keeps a hand-edited value from routing the
 * check to some other doc that happens to exist.
 */
function isUserDocRef(ref: unknown): ref is DocumentReference {
  if (!ref || typeof ref !== 'object') return false;
  const path = (ref as { path?: unknown }).path;
  return typeof path === 'string' && /^users\/[^/]+$/.test(path);
}

/**
 * Whether and where a member can be mailed. Mailable means: linked
 * (`userRef` set), the linked users doc exists (`user`, looked up by the
 * caller from `member.userRef`; undefined when it doesn't), and
 * `member.email` is exactly one valid address; then `opted_out` when the
 * user turned group mail off. Anything else is `not_registered`. A set but
 * invalid member email (a list, an array, `a@b`, ...) is logged when
 * `context` is given, so a skipped mail leaves a trace.
 */
export function memberRecipient(
  member: DocumentData,
  user: DocumentData | undefined,
  context?: string
): MemberRecipient {
  if (!isUserDocRef(member['userRef']) || !user) {
    return { result: 'not_registered' };
  }
  const to: unknown = member['email'];
  if (!isSingleEmailAddress(to)) {
    if (context && to !== undefined && to !== null && to !== '') {
      console.warn(
        `${context}: skipping member "${member['displayName'] ?? ''}" whose stored email is not a single valid address`
      );
    }
    return { result: 'not_registered' };
  }
  if (user['emailOptOut'] === true) return { result: 'opted_out' };
  return { result: 'sent', to };
}
