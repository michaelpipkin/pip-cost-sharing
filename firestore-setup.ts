import { initializeApp } from 'firebase/app';
import { FirebaseConfig } from './src/app/firebase.config';
import { environment } from './src/environments/environment';
import {
  initializeFirestore,
  connectFirestoreEmulator,
} from 'firebase/firestore';

const useEmulators = environment.useEmulators;

const app = initializeApp(FirebaseConfig);
const firestore = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: useEmulators ? true : false,
});

if (useEmulators) {
  connectFirestoreEmulator(firestore, 'localhost', 8080);
}

export { firestore };
