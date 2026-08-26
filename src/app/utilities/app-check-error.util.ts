import { FirebaseError } from 'firebase/app';

// Firestore rejects an App Check-enforced request with a bare
// 'permission-denied'; a Functions callable rejects with
// 'functions/unauthenticated' (the Firebase JS SDK prefixes callable error
// codes with the product name, same convention as 'auth/...' or
// 'storage/...'). Both codes are traced, in this app's error log, to real
// App Check throttle/token-race incidents - see
// .claude/app-check-enforcement-followup.md - with no other confirmed cause
// for either one. 'functions/unauthenticated' is not perfectly exclusive to
// App Check (a genuinely stale ID token could in theory produce the same
// code), but the Firebase client SDK refreshes ID tokens well before real
// expiry, and every occurrence actually observed in this app has been App
// Check - so treating it as "likely App Check" is the right default, and
// the guidance shown for it (retry, try another device/network/browser,
// contact support) remains valid advice even on the rare miss.
const APP_CHECK_LIKELY_CODES = new Set([
  'permission-denied',
  'functions/unauthenticated',
]);

export function isLikelyAppCheckError(error: unknown): boolean {
  return (
    error instanceof FirebaseError && APP_CHECK_LIKELY_CODES.has(error.code)
  );
}
