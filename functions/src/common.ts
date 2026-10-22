import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Timestamp } from 'firebase-admin/firestore';
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

// The address a users/{uid} profile may store for an Auth account: its email
// once verified, else ''. Invited members are linked to users by the profile
// email (users.emailLower), so an unverified address there would let anyone
// register with someone else's address and be linked to their invites.
// firestore.rules enforces the same for client writes (userEmailOwned).
export function profileEmail(user: {
  email?: string;
  emailVerified?: boolean;
}): string {
  return user.emailVerified === true ? (user.email ?? '') : '';
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

// Firebase demo-* projects (the isolated test emulators run under
// demo-pipsplit-test) must never deliver real email. Callers pass
// process.env.GCLOUD_PROJECT explicitly - a default parameter would also
// swallow an explicit `undefined` and fall back to the env var.
export function isDemoProject(projectId: string | undefined): boolean {
  return projectId?.startsWith('demo-') ?? false;
}

// Shape of the SUCCESS `delivery` object written to a `mail` doc, which
// src/app/models/mail.ts and the admin email-log UI read.
export interface MailDelivery {
  state: 'SUCCESS';
  attempts: number;
  startTime: Timestamp;
  endTime: Timestamp;
  info: {
    messageId: string;
    accepted: string[];
    rejected: string[];
    response: string;
  };
}

export function buildSuccessDelivery(
  startTime: Timestamp,
  info: MailDelivery['info']
): MailDelivery {
  return {
    state: 'SUCCESS',
    attempts: 1,
    startTime,
    endTime: Timestamp.now(),
    info,
  };
}

// Realistic SUCCESS delivery for a message that was deliberately not sent.
export function buildSuppressedDelivery(
  to: string | string[],
  startTime: Timestamp
): MailDelivery {
  return buildSuccessDelivery(startTime, {
    messageId: 'suppressed',
    accepted: Array.isArray(to) ? to : [to],
    rejected: [],
    response: 'suppressed: demo project',
  });
}

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
