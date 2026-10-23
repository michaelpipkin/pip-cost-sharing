import { FirebaseError } from 'firebase/app';

// Only the products that enforce App Check: a Functions callable rejects
// with 'functions/unauthenticated' (the Firebase JS SDK prefixes callable
// error codes with the product name, same convention as 'auth/...' or
// 'storage/...'), traced in this app's error log to real App Check
// throttle/token-race incidents (see .claude/app-check-enforcement-followup.md).
// It is not perfectly exclusive to App Check (a genuinely stale ID token
// could in theory produce it), but the client SDK refreshes ID tokens well
// before expiry, and the guidance shown for it (retry, try another
// device/network/browser, contact support) is still valid on the rare miss.
// Firestore's bare 'permission-denied' is NOT included: Firestore App Check
// enforcement was turned off on 2026-08-19, so that code is a rules denial
// and gets the caller's own message. Add it back if Firestore is enforced
// again.
const APP_CHECK_LIKELY_CODES = new Set([
  'functions/unauthenticated',
  // Storage words this "User is not authenticated" even for a signed-in
  // user; a missing/invalid App Check token produces it (seen on a build
  // that couldn't get a Play Integrity token).
  'storage/unauthenticated',
]);

export function isLikelyAppCheckError(error: unknown): boolean {
  return (
    error instanceof FirebaseError && APP_CHECK_LIKELY_CODES.has(error.code)
  );
}
