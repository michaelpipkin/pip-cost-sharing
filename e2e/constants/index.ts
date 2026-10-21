import {
  E2E_APP_PORT,
  TEST_PROJECT_ID,
  emulatorHost,
} from '../../scripts/test-env/config.mjs';

/**
 * Which emulator suite / app server the shared e2e modules talk to.
 *
 * - `test` (default): the isolated test emulators and e2e dev server, derived
 *   from scripts/test-env/config.mjs. Used by the main Playwright config.
 * - `dev`: the owner's dev emulators on the default ports and the dev server
 *   on 4200. Selected ONLY by e2e/feature-tour/playwright.feature-tour.config.ts
 *   (via E2E_TARGET=dev), which captures screenshots against dev data.
 */
type E2eProfile = {
  baseUrl: string;
  projectId: string;
  emulators: {
    auth: string;
    firestore: string;
    functions: string;
    storage: string;
  };
};

const TEST_PROFILE: E2eProfile = {
  baseUrl: `http://localhost:${E2E_APP_PORT}`,
  projectId: TEST_PROJECT_ID,
  emulators: {
    auth: `http://${emulatorHost('auth')}`,
    firestore: `http://${emulatorHost('firestore')}`,
    functions: `http://${emulatorHost('functions')}`,
    storage: `http://${emulatorHost('storage')}`,
  },
};

// Default ports from firebase.json - the only literal ports allowed in e2e/.
const DEV_PROFILE: E2eProfile = {
  baseUrl: 'http://localhost:4200',
  projectId: 'pip-cost-sharing',
  emulators: {
    auth: 'http://127.0.0.1:9099',
    firestore: 'http://127.0.0.1:8080',
    functions: 'http://127.0.0.1:5001',
    storage: 'http://127.0.0.1:9199',
  },
};

const profile = process.env.E2E_TARGET === 'dev' ? DEV_PROFILE : TEST_PROFILE;

// Test environment configuration
export const TEST_CONFIG = {
  baseUrl: profile.baseUrl,
  firebase: {
    projectId: profile.projectId,
    emulators: profile.emulators,
  },
} as const;

/**
 * Bound for every wait in a freshly launched Chromium's first page loads
 * (the global-setup warm-up's login page, sign-in and first route; the
 * browserWarmUp fixture when a browser is launched per worker).
 *
 * On this machine (suspected Norton network filtering) a fresh Chromium's
 * first burst of page requests often sets off a machine-wide stall: for
 * whole ~10 s units (measured 9.7-10.4 s), socket calls in EVERY process
 * block, the browser, the dev server, the emulators and unrelated Node
 * processes alike, while a process that makes no socket calls keeps running.
 * Units come back to back: two fresh browsers each loading a 150-request
 * page from a bare loopback server stalled in 4 of 6 trials, for 1 to 6
 * units (up to 61.5 s), with no emulators, dev server or third-party hosts
 * involved; one browser stalled 2 in 6. New contexts in an already running
 * browser never set it off (Task 11b, 2026-10-21). 120 s is about twice the
 * longest chain measured.
 */
export const FIRST_NAVIGATION_TIMEOUT_MS = 120_000;

/**
 * Environment variable through which global setup hands its already warmed
 * browser to the workers (see e2e/global-setup.ts and the connectOptions
 * fixture), so no Chromium is launched while tests run.
 */
export const SHARED_BROWSER_WS_ENDPOINT_ENV = 'E2E_SHARED_BROWSER_WS_ENDPOINT';

/** Inputs for the login-form validation tests (never real accounts). */
export const TEST_DATA = {
  invalidEmail: 'invalid-email',
  password: 'TestPassword123!',
} as const;
