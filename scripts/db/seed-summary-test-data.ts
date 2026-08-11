/**
 * One-off dev script: seeds test members + expenses into the LOCAL FIRESTORE
 * EMULATOR ONLY, for group G5L5nkg25rnJjNYdOrb2, so the Summary page's new
 * two-table layout can be tested with a realistic number of rows.
 *
 * Safety: FIRESTORE_EMULATOR_HOST is forced before firebase-admin is
 * initialized, so this can never reach production Firestore regardless of
 * local ADC configuration. If the emulator isn't running, the writes below
 * simply fail to connect (127.0.0.1:8080 refused) rather than falling back
 * to a real project.
 *
 * Run from this directory (after `pnpm run emu` / `pnpm run emu:data` is up):
 *   node --experimental-strip-types seed-summary-test-data.ts
 *
 * This is throwaway dev tooling, not one of the ad hoc query scripts in
 * queries/ — delete it once you're done testing, or keep it around for next
 * time.
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const GROUP_ID = 'G5L5nkg25rnJjNYdOrb2';

const NEW_MEMBER_NAMES = [
  'Avery Chen',
  'Jordan Blake',
  'Priya Nair',
  'Marcus Webb',
  'Sofia Ruiz',
  'Ethan Park',
  'Naomi Cole',
  'Liam Ferreira',
  'Grace Okafor',
];

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
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function shuffled<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function main() {
  initializeApp({ projectId: 'pip-cost-sharing' });
  const db = getFirestore();

  const groupRef = db.doc(`groups/${GROUP_ID}`);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new Error(
      `Group ${GROUP_ID} was not found in the emulator. Make sure the emulator is running with data that includes this group (e.g. \`pnpm run emu:data\`).`
    );
  }

  // --- Add 9 new members ---
  const memberBatch = db.batch();
  const newMemberRefs = NEW_MEMBER_NAMES.map((displayName) => {
    const ref = groupRef.collection('members').doc();
    memberBatch.set(ref, {
      displayName,
      email: '',
      active: true,
      groupAdmin: false,
      userRef: null,
    });
    return ref;
  });
  await memberBatch.commit();
  console.log(`Added ${newMemberRefs.length} members to group ${GROUP_ID}.`);

  const existingMembersSnap = await groupRef.collection('members').get();
  const allMemberRefs = existingMembersSnap.docs.map((d) => d.ref);

  // --- Ensure an active category exists ---
  const activeCategorySnap = await groupRef
    .collection('categories')
    .where('active', '==', true)
    .limit(1)
    .get();

  let categoryRef;
  if (activeCategorySnap.empty) {
    categoryRef = groupRef.collection('categories').doc();
    await categoryRef.set({ name: 'General', active: true });
    console.log('No active category found — created "General".');
  } else {
    categoryRef = activeCategorySnap.docs[0]!.ref;
  }

  // --- Add several expenses, each split across most of the group ---
  let dayOffset = 1;
  for (const description of EXPENSE_DESCRIPTIONS) {
    const batch = db.batch();

    const pool = shuffled(allMemberRefs);
    const paidByMemberRef = pool[0]!;
    const participantCount = Math.min(
      allMemberRefs.length,
      4 + Math.floor(Math.random() * (allMemberRefs.length - 3))
    );
    const participants = new Set(pool.slice(0, participantCount));
    participants.add(paidByMemberRef);
    const participantList = [...participants];

    const totalAmount = round2(20 + Math.random() * 180);
    const perPerson = round2(totalAmount / participantList.length);
    const amounts = participantList.map(() => perPerson);
    const remainder = round2(totalAmount - perPerson * participantList.length);
    amounts[amounts.length - 1] = round2(amounts[amounts.length - 1]! + remainder);

    const date = isoDateDaysAgo(dayOffset);
    dayOffset += 2;

    const expenseRef = groupRef.collection('expenses').doc();
    batch.set(expenseRef, {
      date,
      description,
      categoryRef,
      paidByMemberRef,
      sharedAmount: totalAmount,
      allocatedAmount: 0,
      totalAmount,
      splitMethod: 'shares',
      receiptPath: null,
      paid: false,
    });

    participantList.forEach((owedByMemberRef, i) => {
      const splitRef = groupRef.collection('splits').doc();
      batch.set(splitRef, {
        expenseRef,
        date,
        categoryRef,
        assignedAmount: 0,
        percentage: 0,
        shares: 1,
        allocatedAmount: amounts[i],
        paidByMemberRef,
        owedByMemberRef,
        paid: false,
      });
    });

    await batch.commit();
    console.log(
      `Added expense "${description}" for $${totalAmount} split ${participantList.length} ways.`
    );
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
