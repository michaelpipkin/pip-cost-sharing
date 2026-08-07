// Firebase Web SDK config and reCAPTCHA site key - both are meant to be
// public (client-side identifiers, not secrets; see the Firebase docs on
// this). Security comes from Firestore/Storage rules and the reCAPTCHA
// secret key, neither of which lives here. Safe to commit.

export const firebaseConfig = {
  apiKey: 'AIzaSyAIRClJqtRL18jkcg0N1fzUXf-dla9ATcs',
  authDomain: 'pip-cost-sharing.firebaseapp.com',
  projectId: 'pip-cost-sharing',
  storageBucket: 'pip-cost-sharing.appspot.com',
  messagingSenderId: '175229019851',
  appId: '1:175229019851:web:8ae879a7c58a7b77e95d4e',
  measurementId: 'G-7NRCFP68PF',
};

export const appCheckConfig = {
  recaptchaSiteKey: '6Le9dnQtAAAAAPVuqa-iHdOBOFC9vRUHg9P_zDOk',
};
