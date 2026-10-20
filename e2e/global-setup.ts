import { TEST_PROJECT_ID, emulatorHost } from '../scripts/test-env/config.mjs';
import type { FullConfig } from '@playwright/test';
import { seedAll } from './seed';
import { publishSeedToday } from './seed/dates';
import { warmUpDevServer } from './utils/warm-up';

// Global setup always targets the isolated test emulators (never the dev
// profile), so it can wipe them without risk to the owner's dev data.
const FIRESTORE_URL = `http://${emulatorHost('firestore')}`;
const AUTH_URL = `http://${emulatorHost('auth')}`;
const PROBE_TIMEOUT_MS = 5000;
const CLEAR_TIMEOUT_MS = 5000;
const START_HINT =
  'Start e2e via `pnpm e2e` (or `pnpm test:area <area>`).';

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

async function probe(label: string, url: string) {
  try {
    await fetch(`${url}/`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch {
    throw new Error(
      `Test ${label} emulator is not reachable at ${url} (no answer within ${PROBE_TIMEOUT_MS} ms). ${START_HINT}`
    );
  }
}

async function clear(label: string, url: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'DELETE',
      signal: AbortSignal.timeout(CLEAR_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      `Test ${label} emulator did not answer the clear request within ${CLEAR_TIMEOUT_MS} ms (${url}). ${START_HINT}`
    );
  }
  if (!response.ok) {
    throw new Error(
      `Failed to clear ${label} emulator data (${url}): ${response.status} ${await response.text()}`
    );
  }
}

/**
 * Runs once before all tests: refuses ambient E2E_TARGET / E2E_SEED_TODAY,
 * publishes the run's seed date, verifies the test emulators are up, resets
 * Auth and Firestore, seeds the deterministic dataset, then warms up the
 * dev server's routes (after seeding, never alongside it).
 */
export default async function globalSetup(config: FullConfig) {
  assertNoDevTarget();
  publishSeedToday();
  await probe('Firestore', FIRESTORE_URL);
  await probe('Auth', AUTH_URL);

  await clear(
    'Auth',
    `${AUTH_URL}/emulator/v1/projects/${TEST_PROJECT_ID}/accounts`
  );
  await clear(
    'Firestore',
    `${FIRESTORE_URL}/emulator/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents`
  );

  await seedAll();
  await warmUpDevServer(config.projects[0].use.baseURL);
}
