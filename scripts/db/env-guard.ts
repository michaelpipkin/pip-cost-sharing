/**
 * Decides which backend the ad hoc query scripts (queries/, via lib.ts) talk
 * to, and refuses a mixed environment.
 *
 * The Admin SDK reads each `*_EMULATOR_HOST` variable separately, so a
 * leftover FIREBASE_AUTH_EMULATOR_HOST in the shell makes Auth calls go to an
 * emulator while Firestore still goes to PRODUCTION. For a writer such as
 * clear-unverified-profile-emails that is catastrophic: an emulator with no
 * users makes every production profile look orphaned. So:
 *  - with no `*_EMULATOR_HOST` set, the scripts run against production;
 *  - with any of them set, they refuse to start;
 *  - `--emulator` is the explicit opt-in for the owner's DEV emulators: it
 *    sets all three hosts itself (default dev ports, as emulator-lib.ts
 *    does), whatever the shell had, so the two backends are never mixed.
 *
 * Pure (takes the env and argv), so scripts/db/env-guard.test.mjs can test
 * it; lib.ts applies it before initializing firebase-admin.
 */

/** The owner's dev emulators (firebase.json defaults), never the test ones. */
export const DEV_EMULATOR_HOSTS = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
} as const;

export const EMULATOR_FLAG = '--emulator';

export type QueryTarget =
  | { kind: 'production' }
  | { kind: 'emulators'; hosts: Record<string, string> };

/** Every non-empty `*_EMULATOR_HOST` variable in `env`, sorted. */
export function ambientEmulatorHosts(
  env: Record<string, string | undefined>
): string[] {
  return Object.keys(env)
    .filter((key) => key.endsWith('_EMULATOR_HOST') && !!env[key])
    .sort();
}

export class QueryEnvError extends Error {}

export function resolveQueryTarget(
  env: Record<string, string | undefined>,
  argv: readonly string[]
): QueryTarget {
  if (argv.includes(EMULATOR_FLAG)) {
    return { kind: 'emulators', hosts: { ...DEV_EMULATOR_HOSTS } };
  }
  const ambient = ambientEmulatorHosts(env);
  if (ambient.length > 0) {
    throw new QueryEnvError(
      `Refusing to run: ${ambient.join(', ')} ${ambient.length === 1 ? 'is' : 'are'} set in this shell. ` +
        'The query scripts target PRODUCTION, and a leftover emulator variable would mix an ' +
        'emulator with production (e.g. Auth from the emulator, Firestore from production). ' +
        `Unset ${ambient.length === 1 ? 'it' : 'them'} to run against production, or pass ` +
        `-- ${EMULATOR_FLAG} to run against the dev emulators (8080/9099/9199).`
    );
  }
  return { kind: 'production' };
}
