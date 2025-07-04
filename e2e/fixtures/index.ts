import { test as base } from '@playwright/test';
import {
  clearFirebaseData,
  configureFirebaseEmulators,
  waitForFirebaseEmulators,
} from '../utils/firebase';

// Define types for our fixtures
type TestFixtures = {
  // Clean Firebase state for each test (requires running emulators) - CLEARS ALL DATA
  cleanFirebase: void;
  // Page with Firebase emulators configured but preserves existing data
  firebasePage: any; // Using any to match Page type
  // Page with Firebase emulators configured that preserves seed data
  preserveDataFirebasePage: any;
};

// Extend base test with our fixtures
export const test = base.extend<TestFixtures>({
  // Firebase emulator setup and cleanup
  cleanFirebase: async ({ page }, use) => {
    try {
      // Check if emulators are running first
      await waitForFirebaseEmulators(page);

      // Clear any existing data
      await clearFirebaseData(page);

      // Configure the page to use emulators
      await configureFirebaseEmulators(page);

      await use();

      // Cleanup after test
      await clearFirebaseData(page);
    } catch (error) {
      throw new Error(
        `Firebase emulators not running. Please start them manually with: pnpm emu:data\n` +
          `Original error: ${error.message}`
      );
    }
  },

  // Page with Firebase emulators pre-configured
  firebasePage: async ({ page, cleanFirebase }, use) => {
    await use(page);
  },

  // Page with Firebase emulators configured but preserves existing seed data
  preserveDataFirebasePage: async ({ page }, use) => {
    try {
      // Check if emulators are running first
      await waitForFirebaseEmulators(page);

      // Configure the page to use emulators (but don't clear existing data)
      await configureFirebaseEmulators(page);

      await use(page);

      // Don't clear data after test - preserve seed data
    } catch (error) {
      throw new Error(
        `Firebase emulators not running. Please start them manually with: pnpm emu:data\n` +
          `Original error: ${error.message}`
      );
    }
  },
});

export { expect } from '@playwright/test';
