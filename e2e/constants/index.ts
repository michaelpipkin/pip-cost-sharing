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
 * Bound for the first page load of a freshly launched Chromium (global-setup
 * warm-up, browserWarmUp fixture). On this machine every new browser's
 * network stalls for ~10.5 s, sometimes two or three times in a row (worker
 * first loads measured 12-24 s, up to 33 s), while its later loads take
 * 1-3 s. The stall is machine-wide, not the dev server: in the stalled
 * traces, responses from the dev server, the Firestore emulator and Google's
 * font/ad CDNs all arrive ~10.5 s late together, and a Cloud Functions
 * trigger's emulator call stalls 10 s at the same moment. It can land before
 * or after DOMContentLoaded (on the lazy route's dependencies), so the bound
 * covers the rendered login form, not just the document.
 */
export const FIRST_NAVIGATION_TIMEOUT_MS = 120_000;

/** Inputs for the login-form validation tests (never real accounts). */
export const TEST_DATA = {
  invalidEmail: 'invalid-email',
  password: 'TestPassword123!',
} as const;
