import { defineConfig } from 'vitest/config';

/**
 * Tests run against the real Firebase emulators (Auth/Firestore/Storage), in
 * the isolated test suite (firebase.test.json, project demo-pipsplit-test, test
 * ports). `pnpm test` starts and stops them via
 * scripts/test-env/with-test-emulators.mjs; the owner's dev emulators on the
 * default ports are never touched.
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
      GCLOUD_PROJECT: 'demo-pipsplit-test',
      GOOGLE_CLOUD_PROJECT: 'demo-pipsplit-test',
      FUNCTIONS_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:19199',
      // Admin SDK needs this to resolve the default bucket for storage.bucket()
      // with no args, since there's no Cloud Functions runtime to supply it.
      FIREBASE_CONFIG:
        '{"projectId":"demo-pipsplit-test","storageBucket":"demo-pipsplit-test.appspot.com"}',
    },
  },
});
