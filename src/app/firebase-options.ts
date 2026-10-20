import type { FirebaseOptions } from 'firebase/app';
import { firebaseConfig } from './firebase.config';

/**
 * Returns the options to initialize Firebase with. With no emulator project ID
 * the real config is returned unchanged; otherwise the project ID and storage
 * bucket are swapped for the emulator's (e.g. a `demo-*` project) and the
 * measurementId is omitted, so the app talks to an isolated emulator suite.
 * Pure: does not call initializeApp.
 *
 * Lives outside firebase.config.ts because that file is gitignored (generated
 * from secrets in CI), so tracked logic can't go in it.
 */
export function resolveFirebaseOptions(
  projectId: string | null
): FirebaseOptions {
  if (projectId === null) {
    return firebaseConfig;
  }
  // measurementId is dropped so the web Analytics SDK stays off the real
  // Firebase Installations / GA endpoints during emulator runs.
  const { measurementId: _measurementId, ...rest } = firebaseConfig;
  return {
    ...rest,
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  };
}
