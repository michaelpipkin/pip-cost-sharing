/**
 * Deletes expenses (and their splits) and history records dated before a
 * given cutoff, across every group. For use once refresh-seed-expenses.ts
 * has accumulated more paid history than you want to keep around locally.
 *
 * Dry-run by default — prints what would be deleted. Pass --apply to write.
 *
 * Note: an expense's receiptPath (if any) is not cleaned up in emulator
 * Storage — acceptable for local throwaway data.
 *
 * LOCAL FIRESTORE EMULATOR ONLY — see emulator-lib.ts for the safety guard.
 *
 * Run from this directory (or `pnpm prune-expenses -- --before=2026-01-01` from
 * the repo root — "prune" alone collides with pnpm's own built-in command):
 *   node --experimental-strip-types prune-expenses.ts --before=2026-01-01
 *   node --experimental-strip-types prune-expenses.ts --before=2026-01-01 --apply
 */
import { db } from './emulator-lib.ts';
import type { DocumentReference } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const beforeArg = process.argv.find((a) => a.startsWith('--before='));
const cutoff = beforeArg?.slice('--before='.length);

if (!cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
  console.error('Usage: node --experimental-strip-types prune-expenses.ts --before=YYYY-MM-DD [--apply]');
  process.exit(1);
}

const BATCH_LIMIT = 400;

class ChunkedBatch {
  #batches: FirebaseFirestore.WriteBatch[] = [db.batch()];
  #count = 0;

  #current(): FirebaseFirestore.WriteBatch {
    if (this.#count >= BATCH_LIMIT) {
      this.#batches.push(db.batch());
      this.#count = 0;
    }
    this.#count++;
    return this.#batches[this.#batches.length - 1]!;
  }

  delete(ref: DocumentReference): void {
    this.#current().delete(ref);
  }

  async commit(): Promise<void> {
    for (const batch of this.#batches) {
      await batch.commit();
    }
  }
}

async function pruneGroup(
  groupRef: DocumentReference,
  groupName: string,
  batch: ChunkedBatch
): Promise<{ expenses: number; splits: number; history: number }> {
  const expensesSnap = await groupRef.collection('expenses').where('date', '<', cutoff!).get();
  let splitCount = 0;

  for (const expenseDoc of expensesSnap.docs) {
    batch.delete(expenseDoc.ref);
    const splitsSnap = await groupRef
      .collection('splits')
      .where('expenseRef', '==', expenseDoc.ref)
      .get();
    for (const splitDoc of splitsSnap.docs) {
      batch.delete(splitDoc.ref);
      splitCount++;
    }
  }

  const historySnap = await groupRef.collection('history').where('date', '<', cutoff!).get();
  for (const historyDoc of historySnap.docs) {
    batch.delete(historyDoc.ref);
  }

  if (expensesSnap.size > 0 || historySnap.size > 0) {
    console.log(
      `"${groupName}": ${expensesSnap.size} expense(s), ${splitCount} split(s), ` +
        `${historySnap.size} history doc(s) dated before ${cutoff}`
    );
  }

  return { expenses: expensesSnap.size, splits: splitCount, history: historySnap.size };
}

async function main(): Promise<void> {
  const groupsSnap = await db.collection('groups').get();
  if (groupsSnap.empty) {
    console.log('No groups found in the emulator.');
    return;
  }

  const batch = new ChunkedBatch();
  let totals = { expenses: 0, splits: 0, history: 0 };

  for (const groupDoc of groupsSnap.docs) {
    const groupName = (groupDoc.data()['name'] as string) ?? groupDoc.id;
    const result = await pruneGroup(groupDoc.ref, groupName, batch);
    totals.expenses += result.expenses;
    totals.splits += result.splits;
    totals.history += result.history;
  }

  if (totals.expenses === 0 && totals.history === 0) {
    console.log(`Nothing dated before ${cutoff} — nothing to do.`);
    return;
  }

  console.log(
    `\n${apply ? 'Deleting' : 'Would delete (dry run — pass --apply to write)'}: ` +
      `${totals.expenses} expense(s), ${totals.splits} split(s), ${totals.history} history doc(s) total.`
  );

  if (apply) {
    await batch.commit();
    console.log('Done.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
