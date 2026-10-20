// Environment for Playwright e2e runs: the app talks to the isolated test
// emulator suite (see scripts/test-env/config.mjs), never to the dev emulators
// or production.
const useEmulators = true;

export const environment = {
  production: false,
  useEmulators: useEmulators,
  appOwnerEmail: 'admin@pipsplit.test',
  buildDate: new Date(),
  emulators: {
    projectId: 'demo-pipsplit-test' as string | null,
    auth: 19099,
    firestore: 18080,
    storage: 19199,
    functions: 15001,
  },
};
