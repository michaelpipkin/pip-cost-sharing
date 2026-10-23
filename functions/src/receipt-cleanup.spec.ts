import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { deleteOldPaidExpenses } from './index';
import { uniqueId } from './test-fixtures';

// deleteOldPaidExpenses lists the WHOLE storage bucket (every group's
// receipts, including files other specs created) and decides per file from the
// matching expense doc, found by swapping "receipts" for "expenses" in the
// object name. Each test therefore uses its own group id and asserts only on
// its own files and expense docs.
//
// The cutoff is `new Date(expense.date) < new Date(Date.now() - 90 days)`.
// Expense dates are stored as 'yyyy-mm-dd' strings (ExpenseDto), which
// `new Date()` reads as UTC midnight. So the boundary is in UTC, not local
// time: the date string exactly 90 UTC days before today is already past the
// cutoff (its midnight is earlier than "now minus 90 days") and is deleted,
// while the string 89 days back is kept for the whole of today.

const db = getFirestore();
const bucket = getStorage().bucket();
const createdFiles: string[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC 'yyyy-mm-dd' string for `daysAgo` days before now. */
function dateDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

interface Seeded {
  groupId: string;
  expenseId: string;
  filePath: string;
  expenseRef: DocumentReference;
}

/** An expense doc plus its receipt file. `expense` null means no expense doc. */
async function seed(
  expense: DocumentData | null,
  groupId = uniqueId('g')
): Promise<Seeded> {
  const expenseId = uniqueId('e');
  const filePath = `groups/${groupId}/receipts/${expenseId}`;
  const expenseRef = db.doc(`groups/${groupId}/expenses/${expenseId}`);
  if (expense) {
    await expenseRef.set({ ...expense, receiptPath: filePath });
  }
  await bucket.file(filePath).save(Buffer.from('receipt-bytes'));
  createdFiles.push(filePath);
  return { groupId, expenseId, filePath, expenseRef };
}

async function fileExists(path: string): Promise<boolean> {
  const [exists] = await bucket.file(path).exists();
  return exists;
}

function run() {
  return Promise.resolve(deleteOldPaidExpenses.run({} as any));
}

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await Promise.all(
    createdFiles.map((path) => bucket.file(path).delete({ ignoreNotFound: true }))
  );
});

describe('deleteOldPaidExpenses', () => {
  it('deletes the file of a paid expense 91 days old and nulls its receiptPath', async () => {
    const old = await seed({ paid: true, date: dateDaysAgo(91) });

    await run();

    expect(await fileExists(old.filePath)).toBe(false);
    const after = await old.expenseRef.get();
    expect(after.exists).toBe(true);
    expect(after.data()!['receiptPath']).toBeNull();
  });

  it('keeps the file of a paid expense 89 days old', async () => {
    const recent = await seed({ paid: true, date: dateDaysAgo(89) });

    await run();

    expect(await fileExists(recent.filePath)).toBe(true);
    expect((await recent.expenseRef.get()).data()!['receiptPath']).toBe(
      recent.filePath
    );
  });

  it('treats the date string exactly 90 UTC days back as past the cutoff', async () => {
    // new Date('yyyy-mm-dd') is UTC midnight, which is earlier than
    // now - 90 days at any moment after 00:00:00.000 UTC today.
    const boundary = await seed({ paid: true, date: dateDaysAgo(90) });

    await run();

    expect(await fileExists(boundary.filePath)).toBe(false);
    expect(
      (await boundary.expenseRef.get()).data()!['receiptPath']
    ).toBeNull();
  });

  it('keeps the file of an unpaid expense however old', async () => {
    const unpaid = await seed({ paid: false, date: dateDaysAgo(400) });

    await run();

    expect(await fileExists(unpaid.filePath)).toBe(true);
    expect((await unpaid.expenseRef.get()).data()!['receiptPath']).toBe(
      unpaid.filePath
    );
  });

  it('keeps the file of a paid expense that has no date', async () => {
    const undated = await seed({ paid: true });

    await run();

    expect(await fileExists(undated.filePath)).toBe(true);
    expect((await undated.expenseRef.get()).data()!['receiptPath']).toBe(
      undated.filePath
    );
  });

  it('keeps a file with no expense doc, without error', async () => {
    const orphan = await seed(null);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(run()).resolves.toBeUndefined();

    expect(await fileExists(orphan.filePath)).toBe(true);
    expect((await orphan.expenseRef.get()).exists).toBe(false);
    // "Not found" is logged with console.log, not treated as an error.
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining(orphan.filePath),
      expect.anything()
    );
  });

  it("does not let one malformed object name stop the others", async () => {
    const groupId = uniqueId('g');
    // 'receipts/0-bad/extra' maps to an odd-length document path, which
    // db.doc() rejects. "0-" sorts before the "e-" ids, so it is listed first.
    const badPath = `groups/${groupId}/receipts/0-bad/extra`;
    await bucket.file(badPath).save(Buffer.from('bad'));
    createdFiles.push(badPath);
    const old = await seed({ paid: true, date: dateDaysAgo(120) }, groupId);
    const recent = await seed({ paid: true, date: dateDaysAgo(5) }, groupId);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(run()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(badPath),
      expect.anything()
    );
    expect(await fileExists(badPath)).toBe(true);
    expect(await fileExists(old.filePath)).toBe(false);
    expect((await old.expenseRef.get()).data()!['receiptPath']).toBeNull();
    expect(await fileExists(recent.filePath)).toBe(true);
  });

  it('logs a getFiles failure and resolves, touching nothing', async () => {
    const old = await seed({ paid: true, date: dateDaysAgo(200) });
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    // index.ts holds the same Storage instance (getStorage() is memoized per
    // app), so replacing bucket() on it makes its getFiles() call reject.
    vi.spyOn(getStorage(), 'bucket').mockReturnValue({
      getFiles: () => Promise.reject(new Error('listing unavailable')),
    } as any);

    await expect(run()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Error fetching files from storage: ',
      expect.objectContaining({ message: 'listing unavailable' })
    );

    vi.restoreAllMocks();
    // Nothing was processed: the old file is still there and still referenced.
    expect(await fileExists(old.filePath)).toBe(true);
    expect((await old.expenseRef.get()).data()!['receiptPath']).toBe(
      old.filePath
    );
  });
});
