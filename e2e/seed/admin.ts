import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
// Imported from config.mjs directly, never from e2e/constants: that module is
// profile-aware (E2E_TARGET=dev points it at the owner's dev emulators), and
// the seeder must only ever reach the isolated test emulators.
import {
  TEST_PROJECT_ID,
  TEST_STORAGE_BUCKET,
  emulatorHost,
} from '../../scripts/test-env/config.mjs';

const APP_NAME = 'e2e-seed';

/**
 * Admin SDK handles for the isolated test emulators. Points all three Admin
 * SDK emulator env vars at the test ports before initializeApp, and refuses
 * any project ID that isn't a demo- project (which can never reach real
 * Firebase). Safe to call repeatedly: the named app is reused.
 */
export function getSeedAdmin(): { db: Firestore; auth: Auth } {
  const app = getApps().find((a) => a.name === APP_NAME) ?? initSeedApp();
  return { db: getFirestore(app), auth: getAuth(app) };
}

/**
 * Deletes the named app (releasing its gRPC channels) if it exists. The next
 * getSeedAdmin() call re-initializes it.
 */
export async function closeSeedAdmin(): Promise<void> {
  const app = getApps().find((a) => a.name === APP_NAME);
  if (app) await deleteApp(app);
}

function initSeedApp(): App {
  if (!TEST_PROJECT_ID.startsWith('demo-')) {
    throw new Error(
      `Refusing to seed project "${TEST_PROJECT_ID}": the e2e seeder only runs against demo- projects.`
    );
  }
  process.env['FIRESTORE_EMULATOR_HOST'] = emulatorHost('firestore');
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = emulatorHost('auth');
  process.env['FIREBASE_STORAGE_EMULATOR_HOST'] = emulatorHost('storage');

  return initializeApp(
    { projectId: TEST_PROJECT_ID, storageBucket: TEST_STORAGE_BUCKET },
    APP_NAME
  );
}
