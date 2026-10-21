import type { Auth } from 'firebase-admin/auth';
import {
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';
import {
  allocateByPercentage,
  allocateByShares,
  allocateSharedAmounts,
  makeRounder,
  type AllocationSplit,
  type Rounder,
} from '../../scripts/db/allocation';
import { BATCH_LIMIT } from '../../scripts/db/chunked-batch';
import { fixtureFilePath, uploadToStorageEmulator } from './storage';
import type {
  SeedAppError,
  SeedDataset,
  SeedExpense,
  SeedGroup,
  SeedMail,
  SeedMember,
  SeedMemorized,
  SeedPayment,
  SeedRental,
  SeedUser,
} from './types';

// Waiting for the profile docs is progress-based: every createUserProfileOnSignUp
// trigger queues on the functions emulator, so the total time grows with the
// number of users. The wait fails only when no new profile doc has appeared
// for PROFILE_DOC_STALL_MS (a dead trigger), or after PROFILE_DOC_MAX_MS.
// The first doc gets the longer PROFILE_DOC_FIRST_MS: on a cold emulator the
// function workers all start at once and none has run for 15 s or more.
const PROFILE_DOC_STALL_MS = 15_000;
const PROFILE_DOC_FIRST_MS = 60_000;
const PROFILE_DOC_MAX_MS = 300_000;
const PROFILE_DOC_POLL_MS = 250;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export interface SeedBatchStat {
  label: string;
  writes: number;
}

export interface SeedStats {
  users: number;
  groups: number;
  docsWritten: number;
  /** One entry per committed batch, in commit order. */
  batches: SeedBatchStat[];
}

/**
 * Writes validated datasets (see validate.ts) so every document looks exactly
 * like one the app wrote: shapes follow group.service addGroup,
 * member.service addMemberToGroup and scripts/db/refresh-seed-expenses.ts.
 * Fields the Cloud Functions triggers derive (emailLower, the group's member
 * UID arrays) are written up front, so those idempotent triggers no-op.
 *
 * Batches: all user profiles in one, then each group in its own batch,
 * committed before the next group's starts, then the global mail and
 * app_errors docs in a final one. A group's writes therefore never span
 * batches (see GroupBatch for why that matters).
 */
export async function writeDatasets(
  db: Firestore,
  auth: Auth,
  datasets: SeedDataset[]
): Promise<SeedStats> {
  const users = datasets.flatMap((d) => d.users);
  const groups = datasets.flatMap((d) => d.groups);
  const usersByKey = new Map(users.map((u) => [u.key, u]));
  const batches: SeedBatchStat[] = [];
  const commit = async (batch: GroupBatch) => {
    await batch.commit();
    batches.push({ label: batch.label, writes: batch.count });
  };

  await createAuthUsers(db, auth, users);
  const userBatch = new GroupBatch(db, 'users');
  for (const user of users) {
    userBatch.update(db.doc(`users/${user.uid}`), userProfileFields(db, user));
  }
  await commit(userBatch);

  for (const group of groups) {
    const groupBatch = new GroupBatch(db, `group ${group.key}`);
    const receipts = writeGroup(db, groupBatch, group, usersByKey);
    // Objects first, so no committed expense ever points at a missing receipt.
    await uploadReceipts(receipts);
    await commit(groupBatch);
  }

  const globalBatch = new GroupBatch(db, 'mail and app_errors');
  const runStart = Date.now();
  for (const mail of datasets.flatMap((d) => d.mail ?? [])) {
    globalBatch.set(db.doc(`mail/${mail.key}`), mailFields(mail, runStart));
  }
  for (const appError of datasets.flatMap((d) => d.appErrors ?? [])) {
    globalBatch.set(db.doc(`app_errors/${appError.key}`), appErrorFields(appError, runStart));
  }
  await commit(globalBatch);

  return {
    users: users.length,
    groups: groups.length,
    docsWritten: batches.reduce((total, b) => total + b.writes, 0),
    batches,
  };
}

/**
 * One Firestore batch with a write count. Never splits: the seeder commits a
 * group's writes in a single batch, because syncGroupMemberUids recomputes the
 * group's member arrays from the members it can read when each member write
 * lands. If the members were committed across two batches it could see a
 * partial set and overwrite the pre-written UID arrays non-deterministically.
 * So a batch that outgrows the limit fails loudly instead of rolling over.
 */
class GroupBatch {
  readonly label: string;
  count = 0;
  readonly #batch: WriteBatch;

  constructor(db: Firestore, label: string) {
    this.label = label;
    this.#batch = db.batch();
  }

  #bump(): void {
    if (this.count >= BATCH_LIMIT) {
      throw new Error(
        `Seed batch "${this.label}" would exceed ${BATCH_LIMIT} writes; splitting one group's writes across batches races syncGroupMemberUids. Seed less data in this group or restructure write.ts.`
      );
    }
    this.count++;
  }

  set(ref: DocumentReference, data: DocumentData): void {
    this.#bump();
    this.#batch.set(ref, data);
  }

  update(ref: DocumentReference, data: DocumentData): void {
    this.#bump();
    this.#batch.update(ref, data);
  }

  async commit(): Promise<void> {
    await this.#batch.commit();
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
      auth.createUser({
        uid: u.uid,
        email: u.email,
        password: u.password,
        emailVerified: u.emailVerified ?? true,
      })
    )
  );
  await waitForProfileDocs(db, users);
}

/**
 * Polls (one batched read per round) until every user's `users/{uid}` doc
 * exists. The stall timer restarts whenever another doc appears, so a long
 * queue of triggers is fine while a trigger that never runs fails after
 * PROFILE_DOC_STALL_MS without progress (PROFILE_DOC_FIRST_MS before the
 * first doc, to cover the emulator's cold start).
 */
async function waitForProfileDocs(db: Firestore, users: SeedUser[]): Promise<void> {
  const refs = users.map((u) => db.doc(`users/${u.uid}`));
  const start = Date.now();
  let lastProgress = start;
  let existing = 0;
  for (;;) {
    const snaps = await db.getAll(...refs);
    const found = snaps.filter((snap) => snap.exists).length;
    if (found === users.length) {
      console.log(`[e2e seed] ${found} profile docs after ${Date.now() - start} ms`);
      return;
    }
    const now = Date.now();
    if (found > existing) {
      existing = found;
      lastProgress = now;
    }
    const stallMs = existing === 0 ? PROFILE_DOC_FIRST_MS : PROFILE_DOC_STALL_MS;
    const stalled = now - lastProgress >= stallMs;
    if (stalled || now - start >= PROFILE_DOC_MAX_MS) {
      const missing = users.filter((_, i) => !snaps[i]!.exists).map((u) => `"${u.key}"`);
      const reason = stalled
        ? `no new profile doc for ${stallMs} ms`
        : `still waiting after ${PROFILE_DOC_MAX_MS} ms`;
      throw new Error(
        `Timed out (${reason}) waiting for users/{uid}: ${found} of ${users.length} appeared, ` +
          `missing ${missing.join(', ')}. ` +
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

interface ReceiptUpload {
  path: string;
  file: string;
  contentType: string;
}

/** Queues the group's Firestore writes on `batch`; returns the receipts to upload. */
function writeGroup(
  db: Firestore,
  batch: GroupBatch,
  group: SeedGroup,
  usersByKey: Map<string, SeedUser>
): ReceiptUpload[] {
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
    batch.set(memberRef(member.key), memberFields(member, userRefOf(member)));
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
  const receipts: ReceiptUpload[] = [];

  for (const expense of group.expenses ?? []) {
    const ref = expenseRef(expense.key);
    const { splits, sharedAmount, allocatedAmount } = allocateExpense(expense, rounder);
    const common = {
      date: expense.date,
      categoryRef: categoryRef(expense.categoryKey),
    };
    const paidByMemberRef = memberRef(expense.paidByKey);

    // Same path expense.service addExpense uploads a receipt to.
    const receiptPath = expense.receipt ? `groups/${group.key}/receipts/${expense.key}` : null;
    if (expense.receipt && receiptPath) {
      receipts.push({ path: receiptPath, ...expense.receipt });
    }

    const data: DocumentData = {
      date: expense.date,
      description: expense.description,
      categoryRef: common.categoryRef,
      paidByMemberRef,
      sharedAmount,
      allocatedAmount,
      totalAmount: expense.totalAmount,
      splitMethod: expense.splitMethod,
      receiptPath,
      paid: expense.paid === true,
    };
    if (expense.rental) data['rental'] = rentalFields(expense.rental, memberRef);
    expenseData.set(expense.key, data);

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

  for (const memorized of group.memorized ?? []) {
    batch.set(
      groupRef.collection('memorized').doc(memorized.key),
      memorizedFields(memorized, categoryRef, memberRef, rounder)
    );
  }
  return receipts;
}

function memberFields(member: SeedMember, userRef: DocumentReference | null): DocumentData {
  const data: DocumentData = {
    userRef,
    displayName: member.displayName,
    email: member.email,
    active: member.active ?? true,
    groupAdmin: member.groupAdmin ?? false,
  };
  // Omitted (not '' or null) for a blank email, matching deriveEmailLower.
  if (member.email) data['emailLower'] = normalizeEmail(member.email);
  // Only present when true, as leaveGroup writes it (absent means false).
  if (member.leftGroup === true) data['leftGroup'] = true;
  if (member.invite !== undefined) {
    // The shape sendGroupInvite records (the client never writes it).
    data['invite'] = {
      lastSentAt: Timestamp.fromMillis(Date.now() - member.invite.sentDaysAgo * MS_PER_DAY),
      lastSentTo: member.email,
      sendCount: member.invite.sendCount,
    };
  }
  return data;
}

/** The expense's `rental` field, as add-expense persists it (memberRef = member doc ref). */
function rentalFields(
  rental: SeedRental,
  memberRef: (key: string) => DocumentReference
): DocumentData {
  return {
    nightCount: rental.nightCount,
    stays: rental.stays.map((stay) => ({
      memberRef: memberRef(stay.memberKey),
      nights: stay.nights,
      ...(stay.roomId === undefined ? {} : { roomId: stay.roomId }),
    })),
    ...(rental.rooms === undefined ? {} : { rooms: rental.rooms }),
  };
}

/**
 * Mirrors add-memorized onSubmit: the splits are embedded as an array (all of
 * them, including zero-amount ones), and there is no date, paid flag or
 * receiptPath.
 */
function memorizedFields(
  memorized: SeedMemorized,
  categoryRef: (key: string) => DocumentReference,
  memberRef: (key: string) => DocumentReference,
  rounder: Rounder
): DocumentData {
  const { splits, sharedAmount, allocatedAmount } = allocateExpense(memorized, rounder);
  const paidByMemberRef = memberRef(memorized.paidByKey);
  return {
    description: memorized.description,
    categoryRef: categoryRef(memorized.categoryKey),
    paidByMemberRef,
    sharedAmount,
    allocatedAmount,
    totalAmount: memorized.totalAmount,
    splitMethod: memorized.splitMethod,
    splits: splits.map((split) => ({
      assignedAmount: split.assignedAmount,
      percentage: split.percentage,
      shares: split.shares,
      allocatedAmount: split.allocatedAmount,
      paidByMemberRef,
      owedByMemberRef: memberRef(split.owedByMemberRef as string),
    })),
  };
}

async function uploadReceipts(receipts: ReceiptUpload[]): Promise<void> {
  await Promise.all(
    receipts.map(async (receipt) => {
      const filePath = fixtureFilePath(receipt.file);
      if (filePath === undefined) {
        throw new Error(`Receipt file "${receipt.file}" is not a file under e2e/fixtures/files`);
      }
      await uploadToStorageEmulator(receipt.path, await readFile(filePath), receipt.contentType);
    })
  );
}

// ---------------------------------------------------------------------------
// Global collections (mail, app_errors)
// ---------------------------------------------------------------------------

/**
 * A mail doc as the trigger leaves it: always with a `delivery` block, which
 * makes sendMailQueueEmail skip the doc (it returns early when `delivery`
 * exists), so the seeded state is never overwritten.
 */
function mailFields(mail: SeedMail, now: number): DocumentData {
  const startTime = Timestamp.fromMillis(now - mail.startedMinutesAgo * MS_PER_MINUTE);
  const finished = mail.state === 'SUCCESS' || mail.state === 'ERROR';
  const delivery: DocumentData = {
    state: mail.state,
    attempts: mail.state === 'PENDING' ? 0 : 1,
    startTime,
  };
  if (finished) delivery['endTime'] = startTime;
  if (mail.state === 'ERROR' || mail.state === 'RETRY') {
    delivery['error'] = mail.error ?? 'Seeded delivery failure';
  }
  if (mail.state === 'SUCCESS') {
    delivery['info'] = {
      messageId: 'suppressed',
      accepted: [mail.to],
      rejected: [],
      response: 'suppressed: seeded',
    };
  }
  return {
    to: mail.to,
    message: { subject: mail.subject, text: `Seeded mail: ${mail.subject}` },
    delivery,
  };
}

function appErrorFields(appError: SeedAppError, now: number): DocumentData {
  return {
    component: appError.component,
    action: appError.action,
    message: appError.message,
    timestamp: Timestamp.fromMillis(now - appError.hoursAgo * MS_PER_HOUR),
  };
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
  expense: SeedExpense | SeedMemorized,
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
