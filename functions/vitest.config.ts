import { defineConfig } from 'vitest/config';

/**
 * Tests run against the real Firebase emulators (Auth/Firestore/Storage),
 * same as the app's e2e suite. Start them first via `pnpm emu` from the repo
 * root, then run `pnpm test` from this folder.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 20000,
    // Some functions scan entire collections unfiltered (e.g.
    // processUserGroupMemberships), so test files must not race each other
    // against the shared emulator state.
    fileParallelism: false,
    env: {
      GCLOUD_PROJECT: 'pip-cost-sharing',
      GOOGLE_CLOUD_PROJECT: 'pip-cost-sharing',
      FUNCTIONS_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
      FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199',
      // Admin SDK needs this to resolve the default bucket for storage.bucket()
      // with no args, since there's no Cloud Functions runtime to supply it.
      FIREBASE_CONFIG:
        '{"projectId":"pip-cost-sharing","storageBucket":"pip-cost-sharing.appspot.com"}',
    },
  },
});
