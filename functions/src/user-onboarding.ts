import { getFirestore } from 'firebase-admin/firestore';
import * as functionsV1 from 'firebase-functions/v1';
import { profileEmail } from './email-identity';
import { upsertVerifiedEmail } from './verified-emails';

// Creates the Firestore users/{uid} profile doc as soon as a Firebase Auth
// account exists, server-side - independent of whether the client's tab
// stays open long enough to do it itself. The client (UserService in the
// Angular app) used to create this doc on first login, but that raced
// tab-close/backgrounding and left some accounts with no profile doc (see
// .claude/orphaned-registrations-investigation.md); the client's own
// creation logic is now only a fallback for the rare case this trigger
// doesn't complete in time.
//
// v1, not v2: Auth onCreate/onDelete triggers aren't available in
// firebase-functions v2 yet. Mixing v1 and v2 exports from one codebase is
// fully supported by the Firebase CLI - but v1 triggers deploy as GCF Gen1,
// which tops out at the Node runtime declared in functions/package.json's
// engines.node (currently pinned to 22 for exactly this reason - Gen1
// rejects 24). If this trigger is ever removed, that pin can go too.
//
// The profile email is written only when the Auth address is verified
// (Google sign-ups are; email/password registrations are not yet; see
// profileEmail in common.ts). Verifying writes it later (account-action ->
// UserService.updateUserEmailAndLinkMembers).
export const createUserProfileOnSignUp = functionsV1.auth
  .user()
  .onCreate(async (user) => {
    const db = getFirestore();
    const docRef = db.doc(`users/${user.uid}`);
    const defaults: Record<string, unknown> = {
      email: profileEmail(user),
      defaultGroupRef: null,
      receiptPolicy: false,
      emailOptOut: false,
      venmoId: '',
      paypalId: '',
      cashAppId: '',
      zelleId: '',
    };

    // Fills in only the fields the doc lacks, rather than create() or a
    // blind merge: stays idempotent if this ever runs more than once for the
    // same uid (a duplicate delivery, or the client's own fallback path
    // already created it first), and a late run can't reset what was written
    // since - in particular the email that verification writes, which this
    // trigger's snapshot (taken at sign-up, unverified) would otherwise
    // blank.
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const existing = snap.data() ?? {};
        const missing = Object.fromEntries(
          Object.entries(defaults).filter(([field]) => !(field in existing))
        );
        if (Object.keys(missing).length > 0) {
          tx.set(docRef, missing, { merge: true });
        }
      });
    } catch (error) {
      console.error(`Error creating user profile for ${user.uid}:`, error);
      throw error;
    }

    // A verified address is one the account has proven, so invites under it
    // can link through the index. Best-effort: this trigger is never retried
    // (no failurePolicy), so the Groups page's linkInvitedMembers call is the
    // backstop that writes the entry again if this misses.
    if (user.emailVerified && user.email) {
      try {
        await upsertVerifiedEmail(db, user.email, user.uid, 'login');
      } catch (error) {
        console.error(
          `Error indexing the verified address for ${user.uid}:`,
          error
        );
      }
    }
  });
