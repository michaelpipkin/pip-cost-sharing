// Test environment configuration
export const TEST_CONFIG = {
  // Use local.dev.com for local development (hCaptcha compatibility), localhost for CI
  baseUrl: process.env.CI
    ? 'http://localhost:4200'
    : 'http://local.dev.com:4200',
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
    projectId: 'pip-cost-sharing',
    emulators: {
      auth: 'http://127.0.0.1:9099',
      firestore: 'http://127.0.0.1:8080',
      functions: 'http://127.0.0.1:5001',
      storage: 'http://127.0.0.1:9199',
      ui: 'http://127.0.0.1:4000',
    },
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
  navbar: '[data-testid="navbar"]',
  menuButton: '[data-testid="menu-button"]',

  // Forms
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  submitButton: 'button[type="submit"]',

  // Common elements
  loadingSpinner: '[data-testid="loading-spinner"]',
  errorMessage: '[data-testid="error-message"]',
  successMessage: '[data-testid="success-message"]',
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
