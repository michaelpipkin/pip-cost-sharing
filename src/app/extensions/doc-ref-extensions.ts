import { DocumentReference } from 'firebase/firestore';

declare module 'firebase/firestore' {
  interface DocumentReference {
    eq(other: DocumentReference): boolean;
  }
}

// Add the method to the prototype
DocumentReference.prototype.eq = function (other: DocumentReference): boolean {
  if (!this || !other) return this === other;
  return this.path === other.path;
};
