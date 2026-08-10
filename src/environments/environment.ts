// Local environment configuration for development
const useEmulators = true;

export const environment = {
  production: false,
  useEmulators: useEmulators,
  appOwnerEmail: useEmulators ? 'test1@aol.com' : 'michael.a.pipkin@gmail.com',
  buildDate: new Date(),
};
