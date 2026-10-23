import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableOptions, CallableRequest } from 'firebase-functions/v2/https';

const smsClient = new SecretManagerServiceClient();

// The Functions emulator rejects a missing X-Firebase-AppCheck header even
// though the client skips App Check init under emulators, so enforcement
// must be conditional rather than a static `true`.
export const callableAppCheck = {
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
} satisfies CallableOptions;

// The app's public origin, for links in emails. Mirrors BASE_URL in
// src/app/services/page-title-strategy.service.ts: the two projects don't
// share a path-mapped module, so this one constant is deliberately
// duplicated rather than imported.
export const APP_BASE_URL = 'https://pipsplit.com';

export const ADMIN_UID_PROD = 'WUhNUBzjE7TVpU2PgV6ATjsXk9J2';
export const ADMIN_UID_EMU = 'cgrizSOG69QiNquzKOA69ls8clFm';

/** Throws unauthenticated/permission-denied as appropriate; otherwise returns the caller's uid. */
export function assertAdmin(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  // The emulator admin uid is a fixed, public constant, so it only counts
  // inside the Functions emulator.
  const isEmulatorAdmin =
    uid === ADMIN_UID_EMU && process.env.FUNCTIONS_EMULATOR === 'true';
  if (uid !== ADMIN_UID_PROD && !isEmulatorAdmin) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  return uid;
}

/** gRPC FAILED_PRECONDITION, as the Admin SDK reports a failed write precondition. */
const FAILED_PRECONDITION = 9;

/**
 * Deletes each doc only if it is unchanged since `snaps` read it (a
 * lastUpdateTime precondition), so a cleanup can't erase a doc that was
 * renewed between its query and its delete (e.g. a rate-limit counter a
 * send just wrote). A changed or already-deleted doc is skipped. Returns how
 * many it deleted. One delete per doc, not a batch: a batch fails whole when
 * any precondition does.
 */
export async function deleteDocsIfUnchanged(
  snaps: DocumentSnapshot[]
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < snaps.length; i += 100) {
    const results = await Promise.all(
      snaps.slice(i, i + 100).map(async (snap): Promise<number> => {
        try {
          await snap.ref.delete({ lastUpdateTime: snap.updateTime! });
          return 1;
        } catch (error) {
          if ((error as { code?: unknown }).code === FAILED_PRECONDITION) {
            return 0;
          }
          throw error;
        }
      })
    );
    deleted += results.reduce((a, b) => a + b, 0);
  }
  return deleted;
}

// normalizeEmail and profileEmail live in a dependency-free module so the
// admin scripts can import them too.
export { normalizeEmail, profileEmail } from './email-identity';

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
