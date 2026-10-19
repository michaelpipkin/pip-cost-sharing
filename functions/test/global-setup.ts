/**
 * Global setup runs once before all tests.
 * Clears Auth and Firestore data on the isolated test emulators (demo project,
 * test ports — see scripts/test-env/config.mjs) to ensure clean state. Throws
 * if they are unreachable, so a misconfigured run fails loudly instead of
 * testing against stale or missing data.
 */
const PROJECT_ID = 'demo-pipsplit-test';
const AUTH_URL = 'http://127.0.0.1:19099';
const FIRESTORE_URL = 'http://127.0.0.1:18080';

export default async function globalSetup(): Promise<void> {
  console.log('Clearing test emulator data before running functions tests...');

  try {
    await fetch(`${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
      method: 'DELETE',
    });
    await fetch(
      `${FIRESTORE_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: 'DELETE' }
    );
    console.log('Emulator data cleared.');
  } catch (error) {
    throw new Error(
      'Test emulators are unreachable on ports 19099/18080. Run the functions tests via `pnpm test` (it starts them through scripts/test-env/with-test-emulators.mjs).',
      { cause: error }
    );
  }
}
