import { randomUUID } from 'node:crypto';
import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

// Shared builders for functions specs (in src/, not test/, because tsc's rootDir
// is src and the build compiles the specs too). Functions specs share one emulator for
// the whole run (it is cleared once, never per test), so every id and email
// is random and each test asserts only on the documents it created.
//
// getFirestore() is called lazily: the Admin SDK app is initialised by
// importing ./index (or by the vitest setup), which a spec does first.

/** A random id, optionally prefixed so a failing doc path is recognisable. */
export function uniqueId(prefix = 'id'): string {
  return `${prefix}-${randomUUID()}`;
}

/** Creates groups/{id} and returns its reference. */
export async function makeGroup(
  fields: DocumentData = {}
): Promise<DocumentReference> {
  const ref = getFirestore().collection('groups').doc(uniqueId('g'));
  await ref.set({
    name: 'Test Group',
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
    ...fields,
  });
  return ref;
}

/** Creates groups/{group}/members/{id} and returns its reference. */
export async function makeMember(
  group: DocumentReference,
  fields: DocumentData = {}
): Promise<DocumentReference> {
  const ref = group.collection('members').doc(uniqueId('m'));
  await ref.set({
    displayName: 'Member',
    active: true,
    groupAdmin: false,
    userRef: null,
    ...fields,
  });
  return ref;
}
