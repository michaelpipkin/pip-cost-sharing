import { appCheckTokenFailed } from '@app/app-check';
import { FirebaseError } from 'firebase/app';

// A Functions callable refused by App Check rejects with
// 'functions/unauthenticated' (the Firebase JS SDK prefixes callable error
// codes with the product name, same convention as 'auth/...' or
// 'storage/...'), traced in this app's error log to real App Check
// throttle/token-race incidents (see .claude/app-check-enforcement-followup.md).
// It is not perfectly exclusive to App Check (a genuinely stale ID token
// could in theory produce it), but the client SDK refreshes ID tokens well
// before expiry, and the guidance shown for it (retry, try another
// device/network/browser, contact support) is still valid on the rare miss.
const APP_CHECK_LIKELY_CODES = new Set([
  'functions/unauthenticated',
  // Storage words this "User is not authenticated" even for a signed-in
  // user; a missing/invalid App Check token produces it (seen on a build
  // that couldn't get a Play Integrity token).
  'storage/unauthenticated',
]);

// Firestore refuses a request for App Check and for its security rules with
// the same bare 'permission-denied', so the code alone can't tell them
// apart. App Check only refuses a request that carried no valid token, so it
// counts as App Check only when this session's token check came back without
// one. Every other permission-denied is a rules denial and gets the caller's
// own message. Correct whether or not Firestore enforces App Check.
export function isLikelyAppCheckError(error: unknown): boolean {
  if (!(error instanceof FirebaseError)) return false;
  if (APP_CHECK_LIKELY_CODES.has(error.code)) return true;
  return error.code === 'permission-denied' && appCheckTokenFailed();
}
