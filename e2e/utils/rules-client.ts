import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore/lite';
// Imported from config.mjs directly, never from e2e/constants (which is
// profile-aware): these clients must only ever reach the isolated test
// emulators.
import { TEST_PORTS, TEST_PROJECT_ID } from '../../scripts/test-env/config.mjs';

/**
 * Web-SDK clients for the Firestore rules specs (e2e/infra/*-rules.spec.ts).
 * There is no @firebase/rules-unit-testing here, so those specs run in the
 * Playwright worker (Node) with the real client SDK and never open a page.
 * Both emulator connections are made before the first SDK call.
 */

if (!TEST_PROJECT_ID.startsWith('demo-')) {
  throw new Error(
    `Rules specs only run on a demo- project, not ${TEST_PROJECT_ID}`
  );
}

export interface RulesUser {
  email: string;
  password: string;
}

/**
 * Runs `run` with one Firestore client per user, each its own app signed in
 * as that user on the test emulators, then deletes the apps.
 */
export async function withUsers(
  users: RulesUser[],
  run: (dbs: Firestore[]) => Promise<void>
): Promise<void> {
  const apps = users.map(() =>
    initializeApp(
      { apiKey: 'demo-api-key', projectId: TEST_PROJECT_ID },
      `rules-${randomUUID()}`
    )
  );
  try {
    const dbs = await Promise.all(
      apps.map(async (app, i) => {
        const auth = getAuth(app);
        connectAuthEmulator(auth, `http://127.0.0.1:${TEST_PORTS.auth}`, {
          disableWarnings: true,
        });
        const db = getFirestore(app);
        connectFirestoreEmulator(db, '127.0.0.1', TEST_PORTS.firestore);
        const user = users[i]!;
        await signInWithEmailAndPassword(auth, user.email, user.password);
        return db;
      })
    );
    await run(dbs);
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)));
  }
}

/**
 * Runs `run` with one client signed in as `user`, plus its Auth instance (to
 * refresh the ID token mid-test), then deletes the app.
 */
export async function withSession(
  user: RulesUser,
  run: (db: Firestore, auth: Auth) => Promise<void>
): Promise<void> {
  const app = initializeApp(
    { apiKey: 'demo-api-key', projectId: TEST_PROJECT_ID },
    `rules-${randomUUID()}`
  );
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://127.0.0.1:${TEST_PORTS.auth}`, {
      disableWarnings: true,
    });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', TEST_PORTS.firestore);
    await signInWithEmailAndPassword(auth, user.email, user.password);
    await run(db, auth);
  } finally {
    await deleteApp(app);
  }
}

/** Runs `run` with a single client signed in as `user`. */
export function withDb(
  user: RulesUser,
  run: (db: Firestore) => Promise<void>
): Promise<void> {
  return withUsers([user], ([db]) => run(db!));
}

export async function expectAllowed(
  write: Promise<unknown>,
  label?: string
): Promise<void> {
  await expect(write, label).resolves.toBeUndefined();
}

export async function expectDenied(
  write: Promise<unknown>,
  label?: string
): Promise<void> {
  await expect(write, label).rejects.toMatchObject({
    code: 'permission-denied',
  });
}

/**
 * Runs every write and returns the labels of those NOT denied with
 * permission-denied, so one assertion can list every attack that got
 * through instead of stopping at the first.
 */
export async function notDenied(
  writes: [label: string, write: () => Promise<unknown>][]
): Promise<string[]> {
  const through: string[] = [];
  for (const [label, write] of writes) {
    try {
      await write();
      through.push(label);
    } catch (error) {
      if ((error as { code?: string }).code !== 'permission-denied') {
        through.push(`${label} (${String(error)})`);
      }
    }
  }
  return through;
}
