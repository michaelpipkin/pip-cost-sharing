// scripts/test-env/config.mjs is the source of truth for the isolated test
// emulator suite. Several files must repeat its values (JSON/TS configs that
// cannot import an .mjs); this test fails when any copy drifts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  E2E_APP_PORT,
  TEST_PORTS,
  TEST_PROJECT_ID,
  TEST_STORAGE_BUCKET,
} from './config.mjs';

const read = (relative) =>
  readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8'
  );

// Text between the first `{` after `marker` and its matching `}`.
function block(text, marker) {
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `"${marker}" not found`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) {
      return text.slice(open, i + 1);
    }
  }
  throw new Error(`Unbalanced braces after "${marker}"`);
}

const numberProp = (text, name) => {
  const match = new RegExp(`["']?${name}["']?\\s*:\\s*(\\d+)`).exec(text);
  assert.ok(match, `${name} not found`);
  return Number(match[1]);
};

test('firebase.test.json ports match config.mjs', () => {
  const { emulators } = JSON.parse(read('firebase.test.json'));
  assert.equal(emulators.auth.port, TEST_PORTS.auth);
  assert.equal(emulators.firestore.port, TEST_PORTS.firestore);
  assert.equal(emulators.firestore.websocketPort, TEST_PORTS.firestoreWebsocket);
  assert.equal(emulators.storage.port, TEST_PORTS.storage);
  assert.equal(emulators.functions.port, TEST_PORTS.functions);
  assert.equal(emulators.hub.port, TEST_PORTS.hub);
  assert.equal(emulators.logging.port, TEST_PORTS.logging);
  assert.equal(emulators.eventarc.port, TEST_PORTS.eventarc);
  assert.equal(emulators.tasks.port, TEST_PORTS.tasks);
});

test('environment.e2e.ts emulators block matches config.mjs', () => {
  const text = read('src/environments/environment.e2e.ts');
  const emulators = block(text, 'emulators:');
  const projectId = /projectId\s*:\s*['"]([^'"]+)['"]/.exec(emulators);
  assert.equal(projectId?.[1], TEST_PROJECT_ID);
  assert.equal(numberProp(emulators, 'auth'), TEST_PORTS.auth);
  assert.equal(numberProp(emulators, 'firestore'), TEST_PORTS.firestore);
  assert.equal(numberProp(emulators, 'storage'), TEST_PORTS.storage);
  assert.equal(numberProp(emulators, 'functions'), TEST_PORTS.functions);
});

// The e2e app port (4300) has one literal copy outside config.mjs: the
// `ng serve --port` Playwright starts. environment.e2e.ts carries no app port.
test('playwright.config.ts serves the app on E2E_APP_PORT', () => {
  const text = read('playwright.config.ts');
  const port = /ng serve[^'"`]*--port\s+(\d+)/.exec(text);
  assert.ok(port, 'ng serve --port not found');
  assert.equal(Number(port[1]), E2E_APP_PORT);
  assert.equal(E2E_APP_PORT, 4300);
});

test('functions/vitest.config.ts env matches config.mjs', () => {
  const env = block(read('functions/vitest.config.ts'), 'env:');
  const value = (name) => {
    const match = new RegExp(`${name}\\s*:\\s*(?:\\n\\s*)?'([^']*)'`).exec(env);
    assert.ok(match, `${name} not found`);
    return match[1];
  };
  assert.equal(value('GCLOUD_PROJECT'), TEST_PROJECT_ID);
  assert.equal(value('GOOGLE_CLOUD_PROJECT'), TEST_PROJECT_ID);
  assert.equal(
    value('FIRESTORE_EMULATOR_HOST'),
    `127.0.0.1:${TEST_PORTS.firestore}`
  );
  assert.equal(
    value('FIREBASE_AUTH_EMULATOR_HOST'),
    `127.0.0.1:${TEST_PORTS.auth}`
  );
  assert.equal(
    value('FIREBASE_STORAGE_EMULATOR_HOST'),
    `127.0.0.1:${TEST_PORTS.storage}`
  );
  assert.deepEqual(JSON.parse(value('FIREBASE_CONFIG')), {
    projectId: TEST_PROJECT_ID,
    storageBucket: TEST_STORAGE_BUCKET,
  });
});

test('functions/test/global-setup.ts URLs match config.mjs', () => {
  const text = read('functions/test/global-setup.ts');
  const constant = (name) => {
    const match = new RegExp(`const ${name}\\s*=\\s*'([^']*)'`).exec(text);
    assert.ok(match, `${name} not found`);
    return match[1];
  };
  assert.equal(constant('PROJECT_ID'), TEST_PROJECT_ID);
  assert.equal(constant('AUTH_URL'), `http://127.0.0.1:${TEST_PORTS.auth}`);
  assert.equal(
    constant('FIRESTORE_URL'),
    `http://127.0.0.1:${TEST_PORTS.firestore}`
  );
});
