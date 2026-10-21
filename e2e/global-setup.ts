import { TEST_PROJECT_ID, emulatorHost } from '../scripts/test-env/config.mjs';
import { chromium, type FullConfig } from '@playwright/test';
import { SHARED_BROWSER_WS_ENDPOINT_ENV } from './constants';
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

// E2E_TARGET switches the shared e2e modules (TEST_CONFIG in constants, and
// everything built on it) to the dev emulators. It is only meant for the feature-tour capture config,
// so refuse to run the main suite if it is set in the environment.
function assertNoDevTarget() {
  if (process.env.E2E_TARGET !== undefined) {
    throw new Error(
      `E2E_TARGET is set (${process.env.E2E_TARGET}) - it is only for the feature-tour capture config; unset it before running pnpm e2e.`
    );
  }
}

// The shared browser's endpoint is set here and nowhere else. An ambient
// value would point the workers at some other (or long dead) browser.
function assertNoAmbientSharedBrowser() {
  const ambient = process.env[SHARED_BROWSER_WS_ENDPOINT_ENV];
  if (ambient !== undefined) {
    throw new Error(
      `${SHARED_BROWSER_WS_ENDPOINT_ENV} is set (${ambient}) - global setup sets it for the run's shared browser; unset it before running pnpm e2e.`
    );
  }
}

// Runs that need a browser of their own instead of the shared headless one:
// --headed and --debug (inspector) turn headless off (and the inspector
// sets PWDEBUG); --debug=cli sets neither, so it is read from the runner's
// arguments.
function isInteractiveRun(config: FullConfig): boolean {
  return (
    config.projects[0].use.headless === false ||
    !!process.env.PWDEBUG ||
    process.argv.some((arg) => arg === '--debug' || arg.startsWith('--debug='))
  );
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
 * Runs once before all tests: refuses ambient E2E_TARGET / E2E_SEED_TODAY /
 * E2E_SHARED_BROWSER_WS_ENDPOINT,
 * publishes the run's seed date, verifies the test emulators are up, resets
 * Auth and Firestore, seeds the deterministic dataset, then launches the
 * run's one browser and warms up the dev server's routes in it (after
 * seeding, never alongside it).
 *
 * That browser is shared: its endpoint goes to the workers
 * (SHARED_BROWSER_WS_ENDPOINT_ENV, read by the connectOptions fixture), and
 * the returned function closes it after the run. On this machine a freshly
 * launched Chromium's first page loads set off a machine-wide stall of up
 * to a minute that blocks every process's network calls (see
 * FIRST_NAVIGATION_TIMEOUT_MS), so a browser launched per worker, or again
 * after a failed test restarts its worker, stalled the OTHER worker's
 * running test past its 30 s bounds. Launched once here, the stall is paid
 * before any test starts; new contexts in a running browser don't set it
 * off. Headed and --debug runs (inspector or cli) don't share it (this
 * browser is headless and a debugger wants a browser of its own): their
 * workers launch as before.
 */
export default async function globalSetup(config: FullConfig) {
  assertNoDevTarget();
  assertNoAmbientSharedBrowser();
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

  const browserServer = await chromium.launchServer({ host: '127.0.0.1' });
  try {
    await warmUpDevServer(
      config.projects[0].use.baseURL,
      browserServer.wsEndpoint()
    );
  } catch (error) {
    await browserServer.close();
    throw error;
  }
  if (isInteractiveRun(config)) {
    await browserServer.close();
    return;
  }

  // If the shared browser dies mid-run, every later test fails to connect;
  // say why once instead of leaving only that cascade.
  let closing = false;
  browserServer.process().once('exit', (code, signal) => {
    if (!closing) {
      console.error(
        `[e2e] the shared browser exited during the run (code ${code}, signal ${signal}); every test after this fails to connect to it.`
      );
    }
  });
  process.env[SHARED_BROWSER_WS_ENDPOINT_ENV] = browserServer.wsEndpoint();
  return async () => {
    closing = true;
    delete process.env[SHARED_BROWSER_WS_ENDPOINT_ENV];
    await browserServer.close();
  };
}
