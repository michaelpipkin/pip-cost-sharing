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
 * The `mail` doc addressed to `to`, or null when there is none yet. If a
 * recipient has several, the one whose delivery started last wins (mail docs
 * carry no creation time; ones not yet processed sort last). Reads through
 * the Admin SDK because clients can't read `mail`. The collection is global
 * and written by many specs: look up by a recipient the calling test owns
 * (never count rows or take an unscoped first row), and poll with
 * `expect.poll` since the doc appears when a function writes it.
 */
export async function findMail(to: string): Promise<DocumentData | null> {
  const { db } = getSeedAdmin();
  const snapshot = await db.collection('mail').where('to', '==', to).get();
  if (snapshot.empty) return null;
  const deliveryStartedAt = (data: DocumentData): number =>
    data['delivery']?.startTime?.toMillis?.() ?? 0;
  return snapshot.docs
    .map((d) => d.data())
    .sort((a, b) => deliveryStartedAt(b) - deliveryStartedAt(a))[0];
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
 * since the app sends it right after registering), opens the app's
 * account-action page with it in `page`, then waits until the emulator
 * reports the address verified (Admin SDK on the test Auth emulator). The page itself is not asserted on: a
 * verified user with a group is moved on to Groups almost at once, so the
 * success card is too brief to rely on. Test auth emulator only.
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
