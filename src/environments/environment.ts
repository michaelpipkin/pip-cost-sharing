//import 'zone.js/plugins/zone-error';
// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  useEmulators: true,
  get cloudFunctionsBaseUrl() {
    return this.useEmulators
      ? 'http://localhost:5001/pip-cost-sharing/us-central1/api'
      : 'https://us-central1-pip-cost-sharing.cloudfunctions.net/api';
  },
  buildDate: new Date('2024-12-02T21:45:17.884Z')
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// Included with Angular CLI.
