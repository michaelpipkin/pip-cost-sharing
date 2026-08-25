import { getFirestore } from 'firebase-admin/firestore';
import * as functionsV1 from 'firebase-functions/v1';

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
// fully supported by the Firebase CLI.
export const createUserProfileOnSignUp = functionsV1.auth
  .user()
  .onCreate(async (user) => {
    const docRef = getFirestore().doc(`users/${user.uid}`);

    // merge: true rather than create() - stays idempotent if this ever
    // runs more than once for the same uid (a retry, or the client's own
    // fallback path already created it first).
    try {
      await docRef.set(
        {
          email: user.email ?? '',
          defaultGroupRef: null,
          receiptPolicy: false,
          emailOptOut: false,
          venmoId: '',
          paypalId: '',
          cashAppId: '',
          zelleId: '',
        },
        { merge: true }
      );
    } catch (error) {
      console.error(`Error creating user profile for ${user.uid}:`, error);
      throw error;
    }
  });
