import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  accumulateCategoryTotals,
  buildCategoryBreakdown,
  collectCategoryRefs,
  fetchCategoryNames,
} from './index';

// Minimal fakes for the pure/unit-level tests below — these don't need the
// Firestore emulator since collectCategoryRefs/accumulateCategoryTotals only
// read `.exists`/`.data()`, and fetchCategoryNames only calls `.get()` on the
// refs we hand it.
function fakeDocSnap(
  exists: boolean,
  data?: DocumentData
): DocumentSnapshot {
  return { exists, data: () => data } as unknown as DocumentSnapshot;
}

/** A fake DocumentReference whose `.get()` resolves to a snapshot with a matching `.ref.path`. */
function fakeRef(path: string, exists: boolean, data?: DocumentData) {
  const ref = {
    path,
    get: async () =>
      ({ exists, data: () => data, ref } as unknown as DocumentSnapshot),
  };
  return ref as never;
}

describe('collectCategoryRefs', () => {
  it('collects unique category refs, skipping missing docs and splits without a category', () => {
    const groceriesRef = fakeRef('categories/groceries', true);
    const splitDocs = [
      fakeDocSnap(true, { categoryRef: groceriesRef }),
      fakeDocSnap(true, { categoryRef: groceriesRef }), // duplicate, same path
      fakeDocSnap(true, {}), // no categoryRef
      fakeDocSnap(false), // deleted split doc
    ];

    const result = collectCategoryRefs(splitDocs);

    expect(result.size).toBe(1);
    expect(result.get('categories/groceries')).toBe(groceriesRef);
  });
});

describe('fetchCategoryNames', () => {
  it('maps each category path to its name, falling back to "Unknown" for a missing name field', async () => {
    const groceriesRef = fakeRef('categories/groceries', true, {
      name: 'Groceries',
    });
    const noNameRef = fakeRef('categories/no-name', true, {});
    const categoryRefMap = new Map([
      ['categories/groceries', groceriesRef],
      ['categories/no-name', noNameRef],
    ]);

    const result = await fetchCategoryNames(categoryRefMap);

    expect(result.get('categories/groceries')).toBe('Groceries');
    expect(result.get('categories/no-name')).toBe('Unknown');
  });

  it('omits categories whose doc no longer exists', async () => {
    const deletedRef = fakeRef('categories/deleted', false);
    const result = await fetchCategoryNames(
      new Map([['categories/deleted', deletedRef]])
    );
    expect(result.has('categories/deleted')).toBe(false);
  });
});

describe('accumulateCategoryTotals', () => {
  const payerRef = fakeRef('members/payer', true);
  const otherRef = fakeRef('members/other', true);
  const categoryNameMap = new Map([['categories/groceries', 'Groceries']]);

  it('adds the split amount when the payer owed it, subtracts when the other member owed it', () => {
    const groceriesRef = fakeRef('categories/groceries', true);
    const splitDocs = [
      fakeDocSnap(true, {
        categoryRef: groceriesRef,
        owedByMemberRef: payerRef,
        allocatedAmount: 10,
      }),
      fakeDocSnap(true, {
        categoryRef: groceriesRef,
        owedByMemberRef: otherRef,
        allocatedAmount: 4,
      }),
    ];

    const totals = accumulateCategoryTotals(
      splitDocs,
      categoryNameMap,
      payerRef
    );

    expect(totals.get('Groceries')).toBe(6);
  });

  it('labels a split with no category as "Unknown"', () => {
    const splitDocs = [
      fakeDocSnap(true, { owedByMemberRef: payerRef, allocatedAmount: 5 }),
    ];

    const totals = accumulateCategoryTotals(
      splitDocs,
      categoryNameMap,
      payerRef
    );

    expect(totals.get('Unknown')).toBe(5);
  });

  it('skips split docs that no longer exist', () => {
    const totals = accumulateCategoryTotals(
      [fakeDocSnap(false)],
      categoryNameMap,
      payerRef
    );
    expect(totals.size).toBe(0);
  });
});

describe('buildCategoryBreakdown (integration, against Firestore emulator)', () => {
  const db = getFirestore();

  beforeAll(async () => {
    await db.collection('_health').doc('ping').set({ ok: true });
  });

  it('returns an empty string when there are no splits', async () => {
    const payerRef = db.collection('members').doc();
    await expect(
      buildCategoryBreakdown([], payerRef, 'USD', '$', 2)
    ).resolves.toBe('');
  });

  it('sums allocated amounts per category, direction-adjusted from the payer perspective, sorted alphabetically', async () => {
    const groceriesRef = db.collection('categories').doc();
    const utilitiesRef = db.collection('categories').doc();
    await groceriesRef.set({ name: 'Groceries' });
    await utilitiesRef.set({ name: 'Utilities' });

    const payerRef = db.collection('members').doc();
    const otherRef = db.collection('members').doc();

    const split1Ref = db.collection('splits').doc();
    const split2Ref = db.collection('splits').doc();
    const split3Ref = db.collection('splits').doc();
    await split1Ref.set({
      categoryRef: groceriesRef,
      owedByMemberRef: payerRef,
      allocatedAmount: 10,
    });
    await split2Ref.set({
      categoryRef: groceriesRef,
      owedByMemberRef: otherRef,
      allocatedAmount: 4,
    });
    await split3Ref.set({
      categoryRef: utilitiesRef,
      owedByMemberRef: payerRef,
      allocatedAmount: 20,
    });

    const breakdown = await buildCategoryBreakdown(
      [split1Ref, split2Ref, split3Ref],
      payerRef,
      'USD',
      '$',
      2
    );

    expect(breakdown).toBe('  Groceries: $6.00\n  Utilities: $20.00');
  });

  it('labels a split whose category doc was deleted as "Unknown"', async () => {
    const payerRef = db.collection('members').doc();
    const missingCategoryRef = db.collection('categories').doc(); // never .set()

    const splitRef = db.collection('splits').doc();
    await splitRef.set({
      categoryRef: missingCategoryRef,
      owedByMemberRef: payerRef,
      allocatedAmount: 15,
    });

    const breakdown = await buildCategoryBreakdown(
      [splitRef],
      payerRef,
      'USD',
      '$',
      2
    );

    expect(breakdown).toBe('  Unknown: $15.00');
  });
});
