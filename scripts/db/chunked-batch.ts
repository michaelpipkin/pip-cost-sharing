/**
 * Write-batch helper that splits writes across Firestore batches so each stays
 * under the 500-write limit. Side-effect free: the Firestore instance is passed
 * in by the caller.
 */
import type {
  DocumentReference,
  Firestore,
  Precondition,
} from 'firebase-admin/firestore';

// Firestore batches cap at 500 writes; stay comfortably under that.
export const BATCH_LIMIT = 400;

export class ChunkedBatch {
  readonly #db: Firestore;
  #batches: FirebaseFirestore.WriteBatch[];
  #sizes: number[] = [0];
  #count = 0;
  #committed = 0;

  constructor(db: Firestore) {
    this.#db = db;
    this.#batches = [db.batch()];
  }

  #current(): FirebaseFirestore.WriteBatch {
    if (this.#count >= BATCH_LIMIT) {
      this.#batches.push(this.#db.batch());
      this.#sizes.push(0);
      this.#count = 0;
    }
    this.#count++;
    this.#sizes[this.#sizes.length - 1]!++;
    return this.#batches[this.#batches.length - 1]!;
  }

  /**
   * Writes committed so far. Batches commit one after another, so if one
   * fails, the ones before it stay committed: callers report this count.
   */
  get committed(): number {
    return this.#committed;
  }

  set(ref: DocumentReference, data: FirebaseFirestore.DocumentData): void {
    this.#current().set(ref, data);
  }

  /**
   * `precondition` (e.g. `{ lastUpdateTime }`) fails the whole batch if the
   * doc changed since it was read.
   */
  update(
    ref: DocumentReference,
    data: FirebaseFirestore.DocumentData,
    precondition?: Precondition
  ): void {
    if (precondition) {
      this.#current().update(ref, data, precondition);
    } else {
      this.#current().update(ref, data);
    }
  }

  delete(ref: DocumentReference): void {
    this.#current().delete(ref);
  }

  async commit(): Promise<void> {
    for (const [i, batch] of this.#batches.entries()) {
      await batch.commit();
      this.#committed += this.#sizes[i]!;
    }
  }
}
