// Single source of truth for the isolated test emulator suite. These ports and
// the demo- project ID deliberately differ from firebase.json (the owner's dev
// emulators), so test runs can never touch dev data.
export const TEST_PROJECT_ID = 'demo-pipsplit-test';
export const TEST_STORAGE_BUCKET = 'demo-pipsplit-test.appspot.com';

export const TEST_PORTS = {
  auth: 19099,
  firestore: 18080,
  firestoreWebsocket: 19150,
  storage: 19199,
  functions: 15001,
  hub: 14400,
  logging: 14500,
};

// Dev server port for the e2e suite (the dev app uses 4200).
export const E2E_APP_PORT = 4300;

export function emulatorHost(name) {
  const port = TEST_PORTS[name];
  if (port === undefined) {
    throw new Error(`Unknown emulator: ${name}`);
  }
  return `127.0.0.1:${port}`;
}
