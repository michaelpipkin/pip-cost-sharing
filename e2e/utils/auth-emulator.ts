import { expect, type Page } from '@playwright/test';
import type { DocumentData } from 'firebase-admin/firestore';
// Imported from config.mjs directly, never from e2e/constants (profile-aware,
// can point at the owner's dev emulators): these helpers only reach the
// isolated test emulators.
import {
  TEST_PROJECT_ID,
  emulatorHost,
} from '../../scripts/test-env/config.mjs';
import { getSeedAdmin } from '../seed/admin';

/**
 * The `mail` doc addressed to `to` (and, if given, with exactly this
 * `subject`), or null when there is none yet. If several match, the one whose
 * delivery started last wins (mail docs carry no creation time; ones not yet
 * processed sort last). Pass `subject` when the recipient also gets other
 * mail whose timing the test doesn't control (e.g. a seeded payment's
 * notice). Reads through the Admin SDK because clients can't read `mail`.
 * The collection is global and written by many specs: look up by a
 * recipient the calling test owns (never count rows or take an unscoped
 * first row), and poll with `expect.poll` since the doc appears when a
 * function writes it.
 */
export async function findMail(
  to: string,
  subject?: string
): Promise<DocumentData | null> {
  const { db } = getSeedAdmin();
  const snapshot = await db.collection('mail').where('to', '==', to).get();
  const matches = snapshot.docs
    .map((d) => d.data())
    .filter(
      (data) =>
        subject === undefined || data['message']?.subject === subject
    );
  if (matches.length === 0) return null;
  const deliveryStartedAt = (data: DocumentData): number =>
    data['delivery']?.startTime?.toMillis?.() ?? 0;
  return matches.sort(
    (a, b) => deliveryStartedAt(b) - deliveryStartedAt(a)
  )[0]!;
}

interface OobCode {
  email: string;
  requestType: string;
  oobCode: string;
}

/** Base of the test Auth emulator's REST API (never the default port). */
const AUTH_EMULATOR_API = `http://${emulatorHost('auth')}/emulator/v1/projects/${TEST_PROJECT_ID}`;

/**
 * Verifies `email` the way its verification link would: reads the newest
 * VERIFY_EMAIL oob code the Auth emulator issued for that address (polling,
 * since the app sends it right after registering or changing the address),
 * opens the app's account-action page with it in `page`, then waits until the
 * emulator reports the address verified (Admin SDK on the test Auth
 * emulator). The page itself is not asserted on here: a verified user with a
 * group may be moved on at once, so the success card can be too brief to rely
 * on (the verify screen has its own spec, e2e/auth/account-action.spec.ts, on
 * links from `verifyEmailPath`). Test auth emulator only.
 */
export async function verifyEmailViaEmulator(
  page: Page,
  email: string
): Promise<void> {
  let oobCode = '';
  await expect
    .poll(
      async () => {
        const response = await fetch(`${AUTH_EMULATOR_API}/oobCodes`);
        if (!response.ok) {
          throw new Error(
            `Auth emulator oobCodes request failed: ${response.status} ${response.statusText}`
          );
        }
        const body = (await response.json()) as { oobCodes?: OobCode[] };
        // Registering issues one code for the address; any VERIFY_EMAIL code
        // issued for it verifies it, so which one is picked does not matter.
        const codes = (body.oobCodes ?? []).filter(
          (c) => c.email === email && c.requestType === 'VERIFY_EMAIL'
        );
        oobCode = codes.at(-1)?.oobCode ?? '';
        return oobCode !== '';
      },
      { message: `no verification code issued for ${email}`, timeout: 30_000 }
    )
    .toBe(true);

  await page.goto(
    `/auth/account-action?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`
  );

  await expect
    .poll(
      async () => {
        const user = await getSeedAdmin().auth.getUserByEmail(email);
        return user.emailVerified;
      },
      { message: `${email} never became verified`, timeout: 30_000 }
    )
    .toBe(true);
}

/**
 * The app path (`/auth/account-action?mode=verifyEmail&oobCode=...`) of a
 * fresh verification link for `email`, generated through the Admin SDK on the
 * test Auth emulator. Deterministic and independent of the app's own send
 * button, so a test can open the verify-email screen for a seeded unverified
 * user. Each call issues a new code; the code works once.
 */
export async function verifyEmailPath(email: string): Promise<string> {
  const link = await getSeedAdmin().auth.generateEmailVerificationLink(email);
  const oobCode = new URL(link).searchParams.get('oobCode');
  if (!oobCode) {
    throw new Error(`No oobCode in the verification link for ${email}: ${link}`);
  }
  return `/auth/account-action?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`;
}
