import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './src/app/firebase.config';
import { environment } from './src/environments/environment';
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore';

const useEmulators = environment.useEmulators;

const app = initializeApp(firebaseConfig);
const firestore = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: useEmulators ? true : false,
});

if (useEmulators) {
  connectFirestoreEmulator(firestore, 'localhost', 8080);
}

export { firestore };
