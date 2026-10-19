/**
 * Write-batch helper that splits writes across Firestore batches so each stays
 * under the 500-write limit. Side-effect free: the Firestore instance is passed
 * in by the caller.
 */
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

// Firestore batches cap at 500 writes; stay comfortably under that.
const BATCH_LIMIT = 400;

export class ChunkedBatch {
  readonly #db: Firestore;
  #batches: FirebaseFirestore.WriteBatch[];
  #count = 0;

  constructor(db: Firestore) {
    this.#db = db;
    this.#batches = [db.batch()];
  }

  #current(): FirebaseFirestore.WriteBatch {
    if (this.#count >= BATCH_LIMIT) {
      this.#batches.push(this.#db.batch());
      this.#count = 0;
    }
    this.#count++;
    return this.#batches[this.#batches.length - 1]!;
  }

  set(ref: DocumentReference, data: FirebaseFirestore.DocumentData): void {
    this.#current().set(ref, data);
  }

  update(ref: DocumentReference, data: FirebaseFirestore.DocumentData): void {
    this.#current().update(ref, data);
  }

  async commit(): Promise<void> {
    for (const batch of this.#batches) {
      await batch.commit();
    }
  }
}
