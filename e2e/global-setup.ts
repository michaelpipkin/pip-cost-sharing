import { TEST_PROJECT_ID, emulatorHost } from '../scripts/test-env/config.mjs';

// Global setup always targets the isolated test emulators (never the dev
// profile), so it can wipe them without risk to the owner's dev data.
const FIRESTORE_URL = `http://${emulatorHost('firestore')}`;
const AUTH_URL = `http://${emulatorHost('auth')}`;
const PROBE_TIMEOUT_MS = 2000;

// E2E_TARGET switches the shared e2e modules (constants, createTestUser, ...)
// to the dev emulators. It is only meant for the feature-tour capture config,
// so refuse to run the main suite if it is set in the environment.
function assertNoDevTarget() {
  if (process.env.E2E_TARGET !== undefined) {
    throw new Error(
      `E2E_TARGET is set (${process.env.E2E_TARGET}) - it is only for the feature-tour capture config; unset it before running pnpm e2e.`
    );
  }
}

async function assertEmulatorsRunning() {
  try {
    await fetch(`${FIRESTORE_URL}/`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      'Test emulators are not running. Start e2e via `pnpm e2e` (or `pnpm test:area <area>`).'
    );
  }
}

async function clear(label: string, url: string) {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(
      `Failed to clear ${label} emulator data (${url}): ${response.status} ${await response.text()}`
    );
  }
}

/**
 * Runs once before all tests: verifies the test emulators are up, resets Auth
 * and Firestore, then seeds the deterministic dataset.
 */
export default async function globalSetup() {
  assertNoDevTarget();
  await assertEmulatorsRunning();

  await clear(
    'Auth',
    `${AUTH_URL}/emulator/v1/projects/${TEST_PROJECT_ID}/accounts`
  );
  await clear(
    'Firestore',
    `${FIRESTORE_URL}/emulator/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents`
  );

  // TODO(Task 6): await seedAll(); - seeds the deterministic dataset here.
}
