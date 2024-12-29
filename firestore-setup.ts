import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore';
import { firebaseConfig } from './src/app/firebase.config.ts';
import { environment } from './src/environments/environment';

const useEmulators = environment.useEmulators;

const app = initializeApp(firebaseConfig);
const firestore = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: useEmulators ? true : false,
});

if (useEmulators) {
  connectFirestoreEmulator(firestore, 'localhost', 8080);
}

export { firestore };
