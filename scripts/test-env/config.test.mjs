import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  E2E_APP_PORT,
  TEST_PORTS,
  TEST_PROJECT_ID,
  emulatorHost,
} from './config.mjs';

test('emulatorHost returns the loopback host and port of a known emulator', () => {
  assert.equal(emulatorHost('firestore'), '127.0.0.1:18080');
  assert.equal(emulatorHost('auth'), '127.0.0.1:19099');
  assert.equal(emulatorHost('storage'), '127.0.0.1:19199');
  assert.equal(emulatorHost('functions'), '127.0.0.1:15001');
});

test('emulatorHost rejects an unknown emulator', () => {
  assert.throws(() => emulatorHost('nope'), { message: 'Unknown emulator: nope' });
  // Inherited object keys are not emulators.
  assert.throws(() => emulatorHost('toString'), /Unknown emulator/);
});

// The literal values, not just their agreement with the other files: a change
// to any of these ports is deliberate, and must never land on a default
// emulator port (auth 9099, firestore 8080, storage 9199, functions 5001,
// hub 4400, logging 4500, eventarc 9299, tasks 9499, app 4200).
test('the test suite keeps its own non-default ports and project id', () => {
  assert.equal(TEST_PROJECT_ID, 'demo-pipsplit-test');
  assert.deepEqual(TEST_PORTS, {
    auth: 19099,
    firestore: 18080,
    firestoreWebsocket: 19150,
    storage: 19199,
    functions: 15001,
    hub: 14400,
    logging: 14500,
    eventarc: 19299,
    tasks: 19499,
  });
  assert.equal(E2E_APP_PORT, 4300);
  const defaults = [9099, 8080, 9199, 5001, 4400, 4500, 4200, 9150, 9299, 9499];
  for (const port of [...Object.values(TEST_PORTS), E2E_APP_PORT]) {
    assert.ok(!defaults.includes(port), `${port} is a default dev port`);
  }
});
