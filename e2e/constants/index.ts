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
  // Clipboard functionality works on localhost
  supportsClipboard: true,
  timeout: {
    short: 5000,
    medium: 10000,
    long: 30000,
  },
  retries: {
    default: 2,
    ci: 3,
  },
  firebase: {
    projectId: profile.projectId,
    emulators: profile.emulators,
  },
} as const;

// Common test data
export const TEST_DATA = {
  validEmail: 'test@example.com',
  invalidEmail: 'invalid-email',
  password: 'TestPassword123!',
  shortPassword: '123',
  longText: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(
    10
  ),
  testUsers: {
    regularUser: {
      email: 'user@test.com',
      password: 'TestPassword123!',
      displayName: 'Test User',
    },
    adminUser: {
      email: 'admin@test.com',
      password: 'AdminPassword123!',
      displayName: 'Admin User',
    },
  },
  // Helper function to generate unique test users
  generateUniqueUser: (prefix: string = 'testuser') => ({
    email: `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@test.com`,
    password: 'TestPassword123!',
    displayName: `Test User ${Date.now()}`,
  }),
} as const;

// Common selectors (if not using data-testid)
export const SELECTORS = {
  // Navigation
  navbar: '[data-testid="main-toolbar"]',
  menuButton: '[data-testid="mobile-menu-toggle"]',

  // Forms
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  submitButton: 'button[type="submit"]',

  // Common elements
  errorMessage: '[role="alert"], mat-error',
  successMessage: 'simple-snack-bar',
} as const;

// API endpoints for mocking
export const API_ENDPOINTS = {
  auth: {
    login: '**/auth/login',
    logout: '**/auth/logout',
    register: '**/auth/register',
  },
  // Add other API endpoints as needed
} as const;
