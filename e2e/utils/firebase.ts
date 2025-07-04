import { Page } from '@playwright/test';

/**
 * Firebase Emulator utilities for e2e testing
 */

// Firebase emulator ports (default values)
export const FIREBASE_EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
  storage: 9199,
  ui: 4000,
} as const;

/**
 * Wait for Firebase emulators to be ready
 */
export async function waitForFirebaseEmulators(page: Page) {
  // Wait for Firestore emulator to be ready
  await page.waitForFunction(
    async () => {
      try {
        const response = await fetch('http://127.0.0.1:8080');
        return response.ok;
      } catch {
        return false;
      }
    },
    { timeout: 30000 }
  );

  // Wait for Auth emulator to be ready
  await page.waitForFunction(
    async () => {
      try {
        const response = await fetch('http://127.0.0.1:9099');
        return response.ok;
      } catch {
        return false;
      }
    },
    { timeout: 30000 }
  );
}

/**
 * Clear Firebase emulator data between tests
 */
export async function clearFirebaseData(page: Page) {
  // Clear Firestore data
  await page.request.delete(
    'http://127.0.0.1:8080/emulator/v1/projects/pip-cost-sharing/databases/(default)/documents'
  );

  // Clear Auth data
  await page.request.delete(
    'http://127.0.0.1:9099/emulator/v1/projects/pip-cost-sharing/accounts'
  );
}

/**
 * Create a test user in Firebase Auth emulator
 */
export async function createTestUser(
  page: Page,
  email: string,
  password: string,
  additionalClaims?: Record<string, any>
) {
  const userData = {
    email,
    password,
    returnSecureToken: true,
    ...additionalClaims,
  };

  // Use the correct endpoint for Firebase Auth emulator
  const response = await page.request.post(
    'http://127.0.0.1:9099/www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser?key=fake-api-key',
    {
      data: userData,
    }
  );

  return response.json();
}

/**
 * Set custom claims for a test user
 */
export async function setCustomClaims(
  page: Page,
  userId: string,
  claims: Record<string, any>
) {
  await page.request.post(
    `http://127.0.0.1:9099/emulator/v1/projects/pip-cost-sharing/accounts/${userId}:setCustomClaims`,
    {
      data: { customClaims: claims },
    }
  );
}

/**
 * Add test data to Firestore emulator
 */
export async function addFirestoreTestData(
  page: Page,
  collection: string,
  documentId: string,
  data: Record<string, any>
) {
  const response = await page.request.post(
    `http://127.0.0.1:8080/v1/projects/pip-cost-sharing/databases/(default)/documents/${collection}?documentId=${documentId}`,
    {
      data: {
        fields: convertToFirestoreFields(data),
      },
    }
  );

  return response.json();
}

/**
 * Convert JavaScript object to Firestore field format
 */
function convertToFirestoreFields(obj: any): any {
  const fields: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      fields[key] = { doubleValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(
            (item) => convertToFirestoreFields({ temp: item }).temp
          ),
        },
      };
    } else if (typeof value === 'object' && value !== null) {
      fields[key] = {
        mapValue: {
          fields: convertToFirestoreFields(value),
        },
      };
    }
  }

  return fields;
}

/**
 * Configure Firebase to use emulators in the browser context
 */
export async function configureFirebaseEmulators(page: Page) {
  await page.addInitScript(() => {
    // This script runs before the page loads and configures Firebase to use emulators
    // Set environment variable to match the app's expectation
    (window as any).environment = {
      production: false,
      useEmulators: true,
      cloudFunctionsBaseUrl:
        'http://localhost:5001/pip-cost-sharing/us-central1/api',
      buildDate: new Date(),
    };
  });
}
