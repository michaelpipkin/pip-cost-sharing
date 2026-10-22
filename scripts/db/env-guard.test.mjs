// The query scripts' environment guard (scripts/db/env-guard.ts, applied by
// lib.ts): production only with no *_EMULATOR_HOST in the shell, the dev
// emulators only with an explicit --emulator, never a mix. The lib.ts tests
// spawn a child that imports lib.ts; the guard exits before initializeApp,
// and nothing here makes a network call.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {
  DEV_EMULATOR_HOSTS,
  QueryEnvError,
  ambientEmulatorHosts,
  resolveQueryTarget,
} from './env-guard.ts';

const LIB = pathToFileURL(join(import.meta.dirname, 'lib.ts')).href;

test('no emulator variable: production', () => {
  assert.deepEqual(resolveQueryTarget({ PATH: '/bin' }, ['node', 'run.ts', 'q']), {
    kind: 'production',
  });
});

test('any *_EMULATOR_HOST refuses, naming every one set', () => {
  for (const name of [
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'FIREBASE_DATABASE_EMULATOR_HOST',
  ]) {
    assert.throws(
      () => resolveQueryTarget({ [name]: '127.0.0.1:1' }, ['q']),
      (error) =>
        error instanceof QueryEnvError &&
        error.message.includes(name) &&
        error.message.includes('Refusing to run'),
      name
    );
  }
  assert.deepEqual(
    ambientEmulatorHosts({
      FIREBASE_AUTH_EMULATOR_HOST: 'x',
      FIRESTORE_EMULATOR_HOST: 'y',
      EMPTY_EMULATOR_HOST: '',
      OTHER: 'z',
    }),
    ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']
  );
});

test('--emulator sets all three dev hosts, overriding a mixed shell', () => {
  const target = resolveQueryTarget(
    { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099' },
    ['q', '--emulator']
  );
  assert.deepEqual(target, { kind: 'emulators', hosts: { ...DEV_EMULATOR_HOSTS } });
  assert.deepEqual(DEV_EMULATOR_HOSTS, {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  });
});

function importLib(env, args = []) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.endsWith('_EMULATOR_HOST'))
  );
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(LIB)});`, '--', ...args],
    { env: { ...clean, ...env }, encoding: 'utf8', timeout: 60_000 }
  );
}

test('lib.ts refuses to start with an ambient emulator variable', () => {
  const result = importLib({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Refusing to run: FIREBASE_AUTH_EMULATOR_HOST is set/);
});

test('lib.ts with --emulator uses the dev emulators', () => {
  const result = importLib({}, ['--emulator']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--emulator: using the dev emulators \(127\.0\.0\.1:8080/);
});
