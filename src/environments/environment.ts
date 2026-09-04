// Local environment configuration for development
const useEmulators = true;

export const environment = {
  production: false,
  useEmulators: useEmulators,
  appOwnerEmail: useEmulators
    ? 'test1@email.com'
    : 'michael.a.pipkin@gmail.com',
  buildDate: new Date(),
};
