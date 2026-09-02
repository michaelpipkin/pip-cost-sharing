/**
 * Refreshes emulator seed data for every group: retires all currently-unpaid
 * expenses (marking their splits/expenses paid and writing matching history
 * records, exactly as the app itself does via split.service.ts), then
 * generates a fresh batch of 15-20 unpaid expenses dated within the last 30
 * days, split across all active members using a mix of split methods
 * (amount/percentage/shares) and, when available, categories and payees.
 *
 * Re-runnable: each run ages out the previous batch into paid history and
 * replaces it, so the Expenses page's default filter (unpaid, last 90 days)
 * always has fresh data to show.
 *
 * LOCAL FIRESTORE EMULATOR ONLY — see emulator-lib.ts for the safety guard.
 *
 * Run from this directory (after `pnpm run emu` / `pnpm run emu:data` is up):
 *   node --experimental-strip-types refresh-seed-expenses.ts
 *   node --experimental-strip-types refresh-seed-expenses.ts --skip-history
 *
 * --skip-history: retire old expenses/splits as paid but don't write history
 * docs (avoids firing the sendPaymentNotificationEmail trigger if the
 * Functions emulator happens to be running alongside Firestore).
 */
import {
  allocateByPercentage,
  allocateByShares,
  allocateSharedAmounts,
  db,
  isoDateDaysAgo,
  makeRounder,
  pick,
  randomFloat,
  randomInt,
  shuffled,
  todayIso,
  type AllocationSplit,
} from './emulator-lib.ts';
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';

const SPLIT_METHODS = ['amount', 'percentage', 'shares'] as const;
type SplitMethod = (typeof SPLIT_METHODS)[number];

const EXPENSE_DESCRIPTIONS = [
  'Groceries',
  'Dinner out',
  'Gas',
  'Hotel',
  'Movie tickets',
  'Coffee run',
  'Pizza night',
  'Rental car',
  'Board game cafe',
  'Ice cream',
  'Farmers market',
  'Utility bill',
  'Streaming subscription',
  'Car wash',
  'Hardware store run',
  'Birthday gift',
  'Wine and cheese',
  'Bowling night',
  'Concert tickets',
  'Takeout',
];

const skipHistory = process.argv.includes('--skip-history');

interface MemberRow {
  ref: DocumentReference;
}

interface CategoryRow {
  ref: DocumentReference;
}

// Firestore batches cap at 500 writes; stay comfortably under that.
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

async function retireUnpaidExpenses(
  groupRef: DocumentReference,
  batch: ChunkedBatch,
  round: (value: number) => number
): Promise<{ expensesRetired: number; historyDocsWritten: number }> {
  const unpaidSplitsSnap = await groupRef
    .collection('splits')
    .where('paid', '==', false)
    .get();

  if (unpaidSplitsSnap.empty) {
    return { expensesRetired: 0, historyDocsWritten: 0 };
  }

  // Group unpaid splits by unordered member pair, mirroring how
  // paySplitsBetweenMembers settles one relationship at a time.
  const pairKey = (a: string, b: string): string => [a, b].sort().join('|');
  const pairs = new Map<
    string,
    { splits: FirebaseFirestore.QueryDocumentSnapshot[]; memberA: string; memberB: string }
  >();

  for (const splitDoc of unpaidSplitsSnap.docs) {
    const data = splitDoc.data();
    const paidByRef = data['paidByMemberRef'] as DocumentReference;
    const owedByRef = data['owedByMemberRef'] as DocumentReference;
    if (paidByRef.path === owedByRef.path) continue; // self-split, already paid on write
    const key = pairKey(paidByRef.path, owedByRef.path);
    if (!pairs.has(key)) {
      pairs.set(key, { splits: [], memberA: paidByRef.path, memberB: owedByRef.path });
    }
    pairs.get(key)!.splits.push(splitDoc);
  }

  const touchedExpenseRefs = new Map<string, DocumentReference>();
  let historyDocsWritten = 0;

  for (const { splits } of pairs.values()) {
    // Net balance for this pair across all their unpaid splits, oriented so
    // memberX -> paidTo is positive, matching summary.component.ts's
    // signed-net calculation.
    let net = 0;
    const memberXRef = splits[0]!.data()['paidByMemberRef'] as DocumentReference;
    const memberYRef = splits[0]!.data()['owedByMemberRef'] as DocumentReference;
    const splitRefs: DocumentReference[] = [];

    for (const splitDoc of splits) {
      const data = splitDoc.data();
      const amount = data['allocatedAmount'] as number;
      const paidByRef = data['paidByMemberRef'] as DocumentReference;
      net += paidByRef.path === memberXRef.path ? amount : -amount;
      splitRefs.push(splitDoc.ref);
      batch.update(splitDoc.ref, { paid: true });

      const expenseRef = data['expenseRef'] as DocumentReference;
      touchedExpenseRefs.set(expenseRef.path, expenseRef);
    }

    net = round(net);
    if (!skipHistory && net !== 0) {
      const historyRef = groupRef.collection('history').doc();
      batch.set(historyRef, {
        paidByMemberRef: net > 0 ? memberYRef : memberXRef,
        paidToMemberRef: net > 0 ? memberXRef : memberYRef,
        date: todayIso(),
        totalPaid: Math.abs(net),
        splitsPaid: splitRefs,
      });
      historyDocsWritten++;
    }
  }

  // An expense is fully paid once every one of its splits is paid. We just
  // marked every previously-unpaid split paid, so any expense with at least
  // one split in our pool is now fully paid.
  for (const expenseRef of touchedExpenseRefs.values()) {
    batch.update(expenseRef, { paid: true });
  }

  return { expensesRetired: touchedExpenseRefs.size, historyDocsWritten };
}

function buildSplitsForMethod(
  method: SplitMethod,
  totalAmount: number,
  memberRefs: DocumentReference[],
  rounder: ReturnType<typeof makeRounder>
): { splits: AllocationSplit[]; sharedAmount: number; allocatedAmount: number } {
  if (method === 'percentage') {
    // Random, unequal percentages that we then balance to 100 via the
    // ported allocateByPercentage (last member absorbs the remainder), same
    // as the app's own form does.
    const raw = memberRefs.map(() => randomFloat(5, 40));
    const rawTotal = raw.reduce((a, b) => a + b, 0);
    const splits: AllocationSplit[] = memberRefs.map((owedByMemberRef, i) => ({
      owedByMemberRef,
      assignedAmount: 0,
      percentage: rounder.round((raw[i]! / rawTotal) * 100),
      shares: 0,
      allocatedAmount: 0,
    }));
    const { splits: allocated } = allocateByPercentage({ totalAmount, splits }, rounder);
    return { splits: allocated, sharedAmount: 0, allocatedAmount: 0 };
  }

  if (method === 'shares') {
    const splits: AllocationSplit[] = memberRefs.map((owedByMemberRef) => ({
      owedByMemberRef,
      assignedAmount: 0,
      percentage: 0,
      shares: randomInt(1, 4),
      allocatedAmount: 0,
    }));
    const { splits: allocated } = allocateByShares({ totalAmount, splits }, rounder);
    return { splits: allocated, sharedAmount: 0, allocatedAmount: 0 };
  }

  // 'amount' — a mix of an evenly-shared pool, a proportional
  // ("Evenly Shared Remainder" / "Proportional Amount") pool, and unequal
  // per-member assigned amounts, so members end up with genuinely different
  // totals rather than a plain even split.
  const evenlySharedPool = Math.random() < 0.5 ? rounder.round(totalAmount * randomFloat(0.05, 0.25)) : 0;
  const proportionalPool = Math.random() < 0.7 ? rounder.round(totalAmount * randomFloat(0.05, 0.18)) : 0;
  const assignedPool = rounder.round(totalAmount - evenlySharedPool - proportionalPool);

  // Distribute assignedPool unevenly across members via random weights.
  const weights = memberRefs.map(() => randomFloat(0.4, 1.6));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  const assignedAmounts = memberRefs.map((_, i) =>
    rounder.round((weights[i]! / weightTotal) * assignedPool)
  );
  // Reconcile rounding drift in the assigned pool itself before handing off
  // to allocateSharedAmounts, so assignedPool's own sum is exact.
  const assignedDrift = rounder.round(assignedPool - assignedAmounts.reduce((a, b) => a + b, 0));
  if (assignedDrift !== 0) {
    assignedAmounts[0] = rounder.round(assignedAmounts[0]! + assignedDrift);
  }

  const splits: AllocationSplit[] = memberRefs.map((owedByMemberRef, i) => ({
    owedByMemberRef,
    assignedAmount: assignedAmounts[i]!,
    percentage: 0,
    shares: 0,
    allocatedAmount: 0,
  }));

  const { splits: allocated, adjustedSharedAmount } = allocateSharedAmounts(
    {
      totalAmount,
      sharedAmount: evenlySharedPool,
      allocatedAmount: proportionalPool,
      splits,
    },
    rounder
  );

  return { splits: allocated, sharedAmount: adjustedSharedAmount, allocatedAmount: proportionalPool };
}

async function generateNewExpenses(
  groupRef: DocumentReference,
  members: MemberRow[],
  categories: CategoryRow[],
  decimalPlaces: number,
  batch: ChunkedBatch
): Promise<number> {
  const rounder = makeRounder(decimalPlaces);
  const count = randomInt(15, 20);
  const memberRefs = members.map((m) => m.ref);

  for (let i = 0; i < count; i++) {
    const method = SPLIT_METHODS[i % SPLIT_METHODS.length];
    const description = pick(EXPENSE_DESCRIPTIONS);
    const category = pick(categories);
    const paidByMemberRef = pick(members).ref;
    const date = isoDateDaysAgo(randomInt(0, 29));
    const totalAmount = rounder.round(randomFloat(15, 250));

    const { splits, sharedAmount, allocatedAmount } = buildSplitsForMethod(
      method,
      totalAmount,
      shuffled(memberRefs),
      rounder
    );

    const reconciledTotal = rounder.round(splits.reduce((t, s) => t + s.allocatedAmount, 0));
    if (reconciledTotal !== totalAmount) {
      throw new Error(
        `Split reconciliation failed for "${description}" (${method}): ` +
          `splits sum to ${reconciledTotal}, expected ${totalAmount}`
      );
    }

    const expenseRef = groupRef.collection('expenses').doc();
    batch.set(expenseRef, {
      date,
      description,
      categoryRef: category.ref,
      paidByMemberRef,
      sharedAmount,
      allocatedAmount,
      totalAmount,
      splitMethod: method,
      receiptPath: null,
      paid: false,
    });

    for (const split of splits) {
      if (split.allocatedAmount === 0) continue;
      const owedByMemberRef = split.owedByMemberRef as DocumentReference;
      const splitRef = groupRef.collection('splits').doc();
      batch.set(splitRef, {
        expenseRef,
        date,
        categoryRef: category.ref,
        assignedAmount: split.assignedAmount,
        percentage: split.percentage,
        shares: split.shares,
        allocatedAmount: split.allocatedAmount,
        paidByMemberRef,
        owedByMemberRef,
        paid: owedByMemberRef.path === paidByMemberRef.path,
      });
    }
  }

  return count;
}

async function main(): Promise<void> {
  const groupsSnap = await db.collection('groups').get();
  if (groupsSnap.empty) {
    console.log('No groups found in the emulator.');
    return;
  }

  for (const groupDoc of groupsSnap.docs) {
    const groupRef = groupDoc.ref;
    const groupData = groupDoc.data();
    const groupName = (groupData['name'] as string) ?? groupRef.id;
    const decimalPlaces = (groupData['decimalPlaces'] as number) ?? 2;

    const [membersSnap, categoriesSnap] = await Promise.all([
      groupRef.collection('members').where('active', '==', true).get(),
      groupRef.collection('categories').where('active', '==', true).get(),
    ]);

    const members: MemberRow[] = membersSnap.docs.map((d) => ({ ref: d.ref }));
    const categories: CategoryRow[] = categoriesSnap.docs.map((d: DocumentSnapshot) => ({
      ref: d.ref,
    }));

    if (members.length < 2) {
      console.log(`Skipping "${groupName}" (${groupRef.id}): fewer than 2 active members.`);
      continue;
    }
    if (categories.length === 0) {
      console.log(`Skipping "${groupName}" (${groupRef.id}): no active categories.`);
      continue;
    }

    const batch = new ChunkedBatch();
    const { round } = makeRounder(decimalPlaces);
    const { expensesRetired, historyDocsWritten } = await retireUnpaidExpenses(
      groupRef,
      batch,
      round
    );
    const newCount = await generateNewExpenses(
      groupRef,
      members,
      categories,
      decimalPlaces,
      batch
    );
    await batch.commit();

    console.log(
      `"${groupName}" (${groupRef.id}): retired ${expensesRetired} expense(s) as paid ` +
        `(${historyDocsWritten} history record(s)${skipHistory ? ', skipped' : ''}), ` +
        `added ${newCount} new unpaid expense(s) across ${members.length} member(s) ` +
        `and ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}.`
    );
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
