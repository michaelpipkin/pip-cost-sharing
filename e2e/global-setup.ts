import { execSync } from 'child_process';

/**
 * Global setup runs once before all tests
 * Clears Auth and Firestore emulator data to ensure clean state
 */
export default async function globalSetup() {
  console.log('\n🧹 Clearing Firebase emulator data...');

  try {
    // Clear Auth emulator data
    console.log('  - Clearing Auth data...');
    execSync(
      'curl -s -X DELETE "http://localhost:9099/emulator/v1/projects/pip-cost-sharing/accounts"',
      { stdio: 'pipe' }
    );

    // Clear Firestore emulator data
    console.log('  - Clearing Firestore data...');
    execSync(
      'curl -s -X DELETE "http://localhost:8080/emulator/v1/projects/pip-cost-sharing/databases/(default)/documents"',
      { stdio: 'pipe' }
    );

    console.log('✅ Firebase emulator data cleared successfully\n');
  } catch (error) {
    console.warn('⚠️  Failed to clear emulator data:', error);
    console.warn('Tests will continue but may have stale data\n');
  }
}
