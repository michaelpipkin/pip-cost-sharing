/**
 * Shared Firebase Admin SDK initialization for ad hoc query scripts.
 *
 * Authentication: Application Default Credentials (ADC).
 * One-time setup: run `gcloud auth application-default login`
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type QuerySnapshot, type DocumentData } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

initializeApp({ projectId: 'pip-cost-sharing' });

export const db = getFirestore();
export const auth = getAuth();

/** Pretty-print every document in a QuerySnapshot. */
export function dump(snap: QuerySnapshot<DocumentData>): void {
  if (snap.empty) {
    console.log('(no results)');
    return;
  }
  snap.forEach((d) => console.log(d.id, JSON.stringify(d.data(), null, 2)));
}

/** Print a labelled count. */
export function logCount(label: string, n: number): void {
  console.log(`${label}: ${n}`);
}
