// Local environment configuration for development
export const environment = {
  production: false,
  useEmulators: true,
  get cloudFunctionsBaseUrl() {
    return this.useEmulators
      ? 'http://localhost:5001/pip-cost-sharing/us-central1/api'
      : 'https://us-central1-pip-cost-sharing.cloudfunctions.net/api';
  },
  buildDate: new Date(),
};
