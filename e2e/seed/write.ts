import type { Auth } from 'firebase-admin/auth';
import type {
  DocumentData,
  DocumentReference,
  Firestore,
} from 'firebase-admin/firestore';
import {
  allocateByPercentage,
  allocateByShares,
  allocateSharedAmounts,
  makeRounder,
  type AllocationSplit,
  type Rounder,
} from '../../scripts/db/allocation';
import { ChunkedBatch } from '../../scripts/db/chunked-batch';
import type {
  SeedDataset,
  SeedExpense,
  SeedGroup,
  SeedMember,
  SeedPayment,
  SeedUser,
} from './types';

const PROFILE_DOC_TIMEOUT_MS = 15_000;
const PROFILE_DOC_POLL_MS = 100;

export interface SeedStats {
  users: number;
  groups: number;
  docsWritten: number;
}

/**
 * Writes validated datasets (see validate.ts) so every document looks exactly
 * like one the app wrote: shapes follow group.service addGroup,
 * member.service addMemberToGroup and scripts/db/refresh-seed-expenses.ts.
 * Fields the Cloud Functions triggers derive (emailLower, the group's member
 * UID arrays) are written up front, so those idempotent triggers no-op.
 */
export async function writeDatasets(
  db: Firestore,
  auth: Auth,
  datasets: SeedDataset[]
): Promise<SeedStats> {
  const users = datasets.flatMap((d) => d.users);
  const groups = datasets.flatMap((d) => d.groups);
  const usersByKey = new Map(users.map((u) => [u.key, u]));
  const batch = new CountingBatch(db);

  await createAuthUsers(db, auth, users);
  for (const user of users) {
    batch.update(db.doc(`users/${user.uid}`), userProfileFields(db, user));
  }
  for (const group of groups) {
    writeGroup(db, batch, group, usersByKey);
  }
  await batch.commit();

  return { users: users.length, groups: groups.length, docsWritten: batch.count };
}

/** ChunkedBatch that also counts writes, for the seed summary line. */
class CountingBatch extends ChunkedBatch {
  count = 0;

  override set(ref: DocumentReference, data: DocumentData): void {
    this.count++;
    super.set(ref, data);
  }

  override update(ref: DocumentReference, data: DocumentData): void {
    this.count++;
    super.update(ref, data);
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Creating an Auth user fires createUserProfileOnSignUp, which set()s
 * users/{uid} with default profile values using merge. Profile fields are
 * only written after that doc exists, or the trigger's merge would overwrite
 * them.
 */
async function createAuthUsers(db: Firestore, auth: Auth, users: SeedUser[]): Promise<void> {
  await Promise.all(
    users.map((u) =>
      auth.createUser({ uid: u.uid, email: u.email, password: u.password, emailVerified: true })
    )
  );
  await Promise.all(users.map((u) => waitForProfileDoc(db.doc(`users/${u.uid}`), u)));
}

async function waitForProfileDoc(ref: DocumentReference, user: SeedUser): Promise<void> {
  const deadline = Date.now() + PROFILE_DOC_TIMEOUT_MS;
  while (!(await ref.get()).exists) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${PROFILE_DOC_TIMEOUT_MS} ms waiting for ${ref.path} (user "${user.key}"): ` +
          'createUserProfileOnSignUp never ran - is the functions emulator up and the functions build current?'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, PROFILE_DOC_POLL_MS));
  }
}

function userProfileFields(db: Firestore, user: SeedUser): DocumentData {
  const { defaultGroupKey, ...profile } = user.profile ?? {};
  const fields: DocumentData = { emailLower: normalizeEmail(user.email) };
  for (const [field, value] of Object.entries(profile)) {
    if (value !== undefined) fields[field] = value;
  }
  if (defaultGroupKey !== undefined) {
    fields['defaultGroupRef'] = db.doc(`groups/${defaultGroupKey}`);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

interface SplitRow {
  ref: DocumentReference;
  expenseKey: string;
  paidByKey: string;
  owedByKey: string;
  data: DocumentData;
}

function writeGroup(
  db: Firestore,
  batch: ChunkedBatch,
  group: SeedGroup,
  usersByKey: Map<string, SeedUser>
): void {
  const groupRef = db.doc(`groups/${group.key}`);
  const memberRef = (key: string) => groupRef.collection('members').doc(key);
  const categoryRef = (key: string) => groupRef.collection('categories').doc(key);
  const expenseRef = (key: string) => groupRef.collection('expenses').doc(key);
  const userRefOf = (member: SeedMember) =>
    member.userKey === undefined ? null : db.doc(`users/${usersByKey.get(member.userKey)!.uid}`);

  batch.set(groupRef, {
    name: group.name,
    active: group.active ?? true,
    autoAddMembers: group.autoAddMembers ?? false,
    currencyCode: group.currencyCode ?? 'USD',
    currencySymbol: group.currencySymbol ?? '$',
    decimalPlaces: group.decimalPlaces ?? 2,
    archived: false,
    ...groupMemberArrays(group, usersByKey),
  });

  for (const member of group.members) {
    const data: DocumentData = {
      userRef: userRefOf(member),
      displayName: member.displayName,
      email: member.email,
      active: member.active ?? true,
      groupAdmin: member.groupAdmin ?? false,
    };
    // Omitted (not '' or null) for a blank email, matching deriveEmailLower.
    if (member.email) data['emailLower'] = normalizeEmail(member.email);
    batch.set(memberRef(member.key), data);
  }

  for (const category of group.categories) {
    batch.set(categoryRef(category.key), {
      name: category.name,
      active: category.active ?? true,
    });
  }

  const rounder = makeRounder(group.decimalPlaces ?? 2);
  const splitsByExpense = new Map<string, SplitRow[]>();
  const expenseData = new Map<string, DocumentData>();

  for (const expense of group.expenses ?? []) {
    const ref = expenseRef(expense.key);
    const { splits, sharedAmount, allocatedAmount } = allocateExpense(expense, rounder);
    const common = {
      date: expense.date,
      categoryRef: categoryRef(expense.categoryKey),
    };
    const paidByMemberRef = memberRef(expense.paidByKey);

    expenseData.set(expense.key, {
      date: expense.date,
      description: expense.description,
      categoryRef: common.categoryRef,
      paidByMemberRef,
      sharedAmount,
      allocatedAmount,
      totalAmount: expense.totalAmount,
      splitMethod: expense.splitMethod,
      receiptPath: null,
      paid: expense.paid === true,
    });

    const rows: SplitRow[] = [];
    for (const split of splits) {
      if (split.allocatedAmount === 0) continue;
      const owedByKey = split.owedByMemberRef as string;
      rows.push({
        ref: groupRef.collection('splits').doc(`${expense.key}--${owedByKey}`),
        expenseKey: expense.key,
        paidByKey: expense.paidByKey,
        owedByKey,
        data: {
          expenseRef: ref,
          ...common,
          assignedAmount: split.assignedAmount,
          percentage: split.percentage,
          shares: split.shares,
          allocatedAmount: split.allocatedAmount,
          paidByMemberRef,
          owedByMemberRef: memberRef(owedByKey),
          // Self-splits are paid on write; a paid expense has every split paid.
          paid: owedByKey === expense.paidByKey || expense.paid === true,
        },
      });
    }
    splitsByExpense.set(expense.key, rows);
  }

  const histories = (group.payments ?? []).map((payment) =>
    applyPayment(group, payment, splitsByExpense, expenseData, memberRef, rounder)
  );

  for (const [key, data] of expenseData) batch.set(expenseRef(key), data);
  for (const rows of splitsByExpense.values()) {
    for (const row of rows) batch.set(row.ref, row.data);
  }
  for (const { key, data } of histories) {
    batch.set(groupRef.collection('history').doc(key), data);
  }
}

/** Same derivation as computeGroupMemberArrays in functions/src/index.ts. */
function groupMemberArrays(
  group: SeedGroup,
  usersByKey: Map<string, SeedUser>
): { memberUids: string[]; activeMemberUids: string[]; adminUids: string[] } {
  const memberUids: string[] = [];
  const activeMemberUids: string[] = [];
  const adminUids: string[] = [];
  for (const member of group.members) {
    if (member.userKey === undefined) continue;
    const uid = usersByKey.get(member.userKey)!.uid;
    memberUids.push(uid);
    if ((member.active ?? true) === true) {
      activeMemberUids.push(uid);
      if (member.groupAdmin === true) adminUids.push(uid);
    }
  }
  return { memberUids, activeMemberUids, adminUids };
}

// ---------------------------------------------------------------------------
// Expenses and payments
// ---------------------------------------------------------------------------

function allocateExpense(
  expense: SeedExpense,
  rounder: Rounder
): { splits: AllocationSplit[]; sharedAmount: number; allocatedAmount: number } {
  // The allocation helpers only need a truthy owedByMemberRef; the member key
  // stands in for it and is mapped to a real ref by the caller.
  const inputs: AllocationSplit[] = expense.splits.map((s) => ({
    owedByMemberRef: s.owedByKey,
    assignedAmount: s.assignedAmount ?? 0,
    percentage: s.percentage ?? 0,
    shares: s.shares ?? 0,
    allocatedAmount: 0,
  }));
  const { totalAmount } = expense;

  let result: { splits: AllocationSplit[]; sharedAmount: number; allocatedAmount: number };
  if (expense.splitMethod === 'percentage') {
    const { splits } = allocateByPercentage({ totalAmount, splits: inputs }, rounder);
    result = { splits, sharedAmount: 0, allocatedAmount: 0 };
  } else if (expense.splitMethod === 'shares') {
    const { splits } = allocateByShares({ totalAmount, splits: inputs }, rounder);
    result = { splits, sharedAmount: 0, allocatedAmount: 0 };
  } else {
    const allocatedAmount = expense.allocatedAmount ?? 0;
    const { splits, adjustedSharedAmount } = allocateSharedAmounts(
      { totalAmount, sharedAmount: expense.sharedAmount ?? 0, allocatedAmount, splits: inputs },
      rounder
    );
    result = { splits, sharedAmount: adjustedSharedAmount, allocatedAmount };
  }

  const reconciled = rounder.round(result.splits.reduce((t, s) => t + s.allocatedAmount, 0));
  if (reconciled !== totalAmount) {
    throw new Error(
      `Seed expense "${expense.key}" (${expense.splitMethod}): splits sum to ${reconciled}, expected ${totalAmount}`
    );
  }
  return result;
}

/**
 * Mirrors summary.component's pay flow + split.service
 * paySplitsBetweenMembers: settles the pair's unpaid (non-self) splits on the
 * listed expenses, marks each expense paid once all its splits are, and
 * returns the history doc with the signed net as totalPaid.
 */
function applyPayment(
  group: SeedGroup,
  payment: SeedPayment,
  splitsByExpense: Map<string, SplitRow[]>,
  expenseData: Map<string, DocumentData>,
  memberRef: (key: string) => DocumentReference,
  rounder: Rounder
): { key: string; data: DocumentData } {
  const { paidByKey, paidToKey } = payment;
  const where = `Seed payment "${payment.key}" in group "${group.key}"`;
  const paidRows: SplitRow[] = [];

  for (const expenseKey of payment.expenseKeys) {
    const rows = splitsByExpense.get(expenseKey)!;
    const pairRows = rows.filter(
      (r) =>
        r.data['paid'] === false &&
        ((r.owedByKey === paidByKey && r.paidByKey === paidToKey) ||
          (r.owedByKey === paidToKey && r.paidByKey === paidByKey))
    );
    if (pairRows.length === 0) {
      throw new Error(`${where}: expense "${expenseKey}" has no unpaid splits between the pair`);
    }
    for (const row of pairRows) row.data['paid'] = true;
    expenseData.get(expenseKey)!['paid'] = rows.every((r) => r.data['paid'] === true);
    paidRows.push(...pairRows);
  }

  const totalPaid = rounder.round(
    paidRows.reduce(
      (total, r) =>
        r.paidByKey === paidToKey
          ? total + r.data['allocatedAmount']
          : total - r.data['allocatedAmount'],
      0
    )
  );
  if (totalPaid <= 0) {
    throw new Error(
      `${where}: nets to ${totalPaid} from "${paidByKey}" to "${paidToKey}"; swap paidByKey/paidToKey`
    );
  }

  return {
    key: payment.key,
    data: {
      paidByMemberRef: memberRef(paidByKey),
      paidToMemberRef: memberRef(paidToKey),
      date: payment.date,
      totalPaid,
      splitsPaid: paidRows.map((r) => r.ref),
    },
  };
}

/** Same normalization as member.service #normalizeEmail / functions normalizeEmail. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
