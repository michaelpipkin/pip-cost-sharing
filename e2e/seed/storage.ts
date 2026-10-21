import { fileURLToPath } from 'node:url';
import nodePath from 'node:path';
// Imported from config.mjs directly, never from e2e/constants (profile-aware,
// can point at the owner's dev emulators): Storage access here must only ever
// reach the isolated test emulator. Same rule as admin.ts.
import { TEST_STORAGE_BUCKET, emulatorHost } from '../../scripts/test-env/config.mjs';

/**
 * Seeded and asserted Storage objects go through the Storage emulator's
 * Firebase REST API rather than the Admin SDK, so the seeder needs nothing
 * beyond fetch. `Authorization: Bearer owner` is the emulator's admin
 * bypass: storage.rules do not apply, as for the Admin SDK.
 */
const OWNER_HEADERS = { Authorization: 'Bearer owner' };

/** Directory holding the files a SeedExpense.receipt may reference. */
export const FIXTURE_FILES_DIR = fileURLToPath(new URL('../fixtures/files', import.meta.url));

/**
 * Absolute path of a fixture file, or undefined when `file` is not a plain
 * file name inside FIXTURE_FILES_DIR (no directories, no `..`).
 */
export function fixtureFilePath(file: string): string | undefined {
  const resolved = nodePath.resolve(FIXTURE_FILES_DIR, file);
  return nodePath.dirname(resolved) === FIXTURE_FILES_DIR ? resolved : undefined;
}

function objectsUrl(): string {
  return `http://${emulatorHost('storage')}/v0/b/${TEST_STORAGE_BUCKET}/o`;
}

/** Uploads `bytes` to `path` in the test bucket, replacing any existing object. */
export async function uploadToStorageEmulator(
  path: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  const response = await fetch(`${objectsUrl()}?name=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { ...OWNER_HEADERS, 'Content-Type': contentType },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    throw new Error(
      `Storage emulator upload of "${path}" failed: ${response.status} ${await response.text()}`
    );
  }
}

/** Whether an object exists at `path` in the test bucket. */
export async function storageObjectExists(path: string): Promise<boolean> {
  const response = await fetch(`${objectsUrl()}/${encodeURIComponent(path)}`, {
    headers: OWNER_HEADERS,
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Storage emulator lookup of "${path}" failed: ${response.status} ${await response.text()}`
    );
  }
  return true;
}
