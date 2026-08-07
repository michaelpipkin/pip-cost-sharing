// Template for firebase.config.ts, which is gitignored (contains
// environment-specific values, not secrets - see README "Local setup").
// Copy this file to firebase.config.ts and fill in real values from:
//   - firebaseConfig: Firebase console -> Project settings -> General ->
//     "Your apps" -> Web app -> SDK setup and configuration
//   - appCheckConfig.recaptchaSiteKey: the reCAPTCHA Enterprise key ID from
//     Google Cloud console -> Security -> Fraud Defense (App Check requires
//     ReCaptchaEnterpriseProvider now - see src/app/app.config.ts)

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
};

export const appCheckConfig = {
  recaptchaSiteKey: '',
};
