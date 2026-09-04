import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableOptions, CallableRequest } from 'firebase-functions/v2/https';

const smsClient = new SecretManagerServiceClient();

// The Functions emulator rejects a missing X-Firebase-AppCheck header even
// though the client skips App Check init under emulators, so enforcement
// must be conditional rather than a static `true`.
export const callableAppCheck = {
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
} satisfies CallableOptions;

export const ADMIN_UID_PROD = 'WUhNUBzjE7TVpU2PgV6ATjsXk9J2';
export const ADMIN_UID_EMU = 'cgrizSOG69QiNquzKOA69ls8clFm';

/** Throws unauthenticated/permission-denied as appropriate; otherwise returns the caller's uid. */
export function assertAdmin(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  if (uid !== ADMIN_UID_PROD && uid !== ADMIN_UID_EMU) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  return uid;
}

// Canonical form for email comparisons - Firestore has no case-insensitive
// query operator, and email casing isn't meaningful for matching in
// practice, so every match/lookup normalizes through this first.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Auth accounts that will never have (or need) a Firestore users doc, so
// they're false positives in any "orphaned registration" query rather than
// real sign-ups. play_review@google.com is the account Google Play's review
// crawler requires for Play Store developer verification - it has no
// in-app usage at all. Mirrors NON_USER_AUTH_EMAILS in scripts/db/lib.ts.
export const NON_USER_AUTH_EMAILS = new Set(['play_review@google.com']);

// Accounts excluded from the Active Groups report because they belong to
// the app's own admin/testers rather than real users - their groups would
// otherwise skew the "genuinely used" picture. Mirrors EXCLUDED_EMAILS in
// scripts/db/queries/active-groups.ts, lowercased for emailLower matching.
export const ADMIN_TEST_EMAILS_LOWER = new Set([
  'michael.a.pipkin@gmail.com',
  'blkordis@gmail.com',
  'pip668@yahoo.com',
]);

export const getSmtpPassword = async () => {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return process.env.SMTP_PASSWORD;
  } else {
    const name = 'projects/175229019851/secrets/smtp-password/versions/latest';
    const [version] = await smsClient.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString() || '';
    return payload;
  }
};
