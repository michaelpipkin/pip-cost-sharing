/**
 * Global setup runs once before all tests.
 * Clears Auth and Firestore emulator data to ensure clean state, mirroring
 * the app's e2e global setup (../e2e/global-setup.ts).
 */
export default async function globalSetup(): Promise<void> {
  console.log('Clearing Firebase emulator data before running functions tests...');

  try {
    await fetch(
      'http://localhost:9099/emulator/v1/projects/pip-cost-sharing/accounts',
      { method: 'DELETE' }
    );
    await fetch(
      'http://localhost:8080/emulator/v1/projects/pip-cost-sharing/databases/(default)/documents',
      { method: 'DELETE' }
    );
    console.log('Emulator data cleared.');
  } catch (error) {
    console.warn(
      'Failed to clear emulator data — are the emulators running? Start them with `pnpm emu` from the repo root.',
      error
    );
    console.warn('Tests will continue but may fail or have stale data.\n');
  }
}
