import { existsSync } from 'node:fs';
import { fixtureFilePath } from './storage';
import {
  MAIL_STATES,
  type SeedDataset,
  type SeedExpense,
  type SeedGroup,
  type SeedMember,
  type SeedMemorized,
  type SeedUser,
} from './types';

const SEED_EMAIL_DOMAIN = '@pipsplit.test';

/**
 * Checks every dataset together, so cross-dataset clashes (two datasets
 * claiming the same user or group name) are caught too. Throws one Error
 * listing every problem found, not just the first.
 */
export function validateDatasets(datasets: SeedDataset[]): void {
  const problems: string[] = [];
  const userKeys = new Set<string>();
  const userUids = new Set<string>();
  const userEmails = new Set<string>();
  const groupKeys = new Set<string>();
  const groupNames = new Map<string, string>();
  const groupsByKey = new Map<string, SeedGroup>();
  const usersByKey = new Map<string, SeedUser>();
  // mail and app_errors are global collections, so their keys (the doc IDs)
  // must be unique across all datasets.
  const mailKeys = new Set<string>();
  const appErrorKeys = new Set<string>();

  const checkEmail = (where: string, email: string) => {
    if (!email.trim().toLowerCase().endsWith(SEED_EMAIL_DOMAIN)) {
      problems.push(`${where}: email "${email}" must end in ${SEED_EMAIL_DOMAIN}`);
    }
  };

  for (const dataset of datasets) {
    for (const user of dataset.users) {
      const where = `${dataset.name} user "${user.key}"`;
      claim(problems, userKeys, user.key, `${where}: duplicate user key`);
      usersByKey.set(user.key, user);
      claim(problems, userUids, user.uid, `${where}: duplicate uid "${user.uid}"`);
      claim(
        problems,
        userEmails,
        user.email.trim().toLowerCase(),
        `${where}: duplicate email "${user.email}"`
      );
      checkEmail(where, user.email);
      checkDocId(problems, where, user.uid);
      if (
        user.emailVerified !== undefined &&
        typeof user.emailVerified !== 'boolean'
      ) {
        problems.push(`${where}: emailVerified must be a boolean`);
      }
    }
    for (const group of dataset.groups) {
      const where = `${dataset.name} group "${group.key}"`;
      claim(problems, groupKeys, group.key, `${where}: duplicate group key`);
      groupsByKey.set(group.key, group);
      // Tests select groups by name in the UI, and a case-only difference
      // would still be a near-collision, so compare case-insensitively.
      const nameKey = group.name.trim().toLowerCase();
      const clashesWith = groupNames.get(nameKey);
      if (clashesWith !== undefined) {
        problems.push(
          `${where}: duplicate group name "${group.name}" (names are compared case-insensitively; clashes with "${clashesWith}")`
        );
      }
      groupNames.set(nameKey, group.name);
      if (!group.owner) {
        problems.push(`${where}: missing owner ('shared' or 'spec:<path>')`);
      }
      checkDocId(problems, where, group.key);
    }
    for (const mail of dataset.mail ?? []) {
      const where = `${dataset.name} mail "${mail.key}"`;
      claim(problems, mailKeys, mail.key, `${where}: duplicate mail key "${mail.key}"`);
      checkDocId(problems, where, mail.key);
      checkEmail(where, mail.to);
      if (!(MAIL_STATES as readonly string[]).includes(mail.state)) {
        problems.push(
          `${where}: unknown state "${mail.state}" (expected one of ${MAIL_STATES.join(', ')})`
        );
      }
      if (mail.subject.trim() === '') problems.push(`${where}: subject is blank`);
      checkNonNegative(problems, where, 'startedMinutesAgo', mail.startedMinutesAgo);
    }
    for (const appError of dataset.appErrors ?? []) {
      const where = `${dataset.name} app error "${appError.key}"`;
      claim(
        problems,
        appErrorKeys,
        appError.key,
        `${where}: duplicate app error key "${appError.key}"`
      );
      checkDocId(problems, where, appError.key);
      for (const field of ['component', 'action', 'message'] as const) {
        if (appError[field].trim() === '') problems.push(`${where}: ${field} is blank`);
      }
      checkNonNegative(problems, where, 'hoursAgo', appError.hoursAgo);
    }
  }

  // Second pass: references can point at users/groups from any dataset.
  for (const dataset of datasets) {
    for (const user of dataset.users) {
      const groupKey = user.profile?.defaultGroupKey;
      if (groupKey === undefined) continue;
      const defaultGroup = groupsByKey.get(groupKey);
      if (defaultGroup === undefined) {
        problems.push(
          `${dataset.name} user "${user.key}": unknown defaultGroupKey "${groupKey}"`
        );
      } else if (!defaultGroup.members.some((m) => m.userKey === user.key)) {
        problems.push(
          `${dataset.name} user "${user.key}": defaultGroupKey "${groupKey}" names a group the user is not a member of`
        );
      }
    }
    for (const group of dataset.groups) {
      validateGroup(problems, `${dataset.name} group "${group.key}"`, group, usersByKey, checkEmail);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid e2e seed datasets (${problems.length} problem(s)):\n- ${problems.join('\n- ')}`
    );
  }
}

function validateGroup(
  problems: string[],
  where: string,
  group: SeedGroup,
  usersByKey: Map<string, SeedUser>,
  checkEmail: (where: string, email: string) => void
): void {
  const memberKeys = new Set<string>();
  const categoryKeys = new Set<string>();
  const expenseKeys = new Set<string>();
  const memorizedKeys = new Set<string>();
  const paymentKeys = new Set<string>();
  const linkedUsers = new Set<string>();
  const memberEmails = new Set<string>();

  for (const member of group.members) {
    const at = `${where} member "${member.key}"`;
    claim(problems, memberKeys, member.key, `${at}: duplicate member key`);
    checkDocId(problems, at, member.key);
    // A null email (legacy shape, rules tests only) is treated as blank.
    const memberEmail = member.email ?? '';
    if (memberEmail.trim() !== '') {
      checkEmail(at, memberEmail);
      claim(
        problems,
        memberEmails,
        memberEmail.trim().toLowerCase(),
        `${at}: duplicate member email "${memberEmail}" (compared case-insensitively)`
      );
    }
    validateMemberState(problems, at, member);
    if (member.userKey !== undefined) {
      const user = usersByKey.get(member.userKey);
      if (user === undefined) {
        problems.push(`${at}: unknown userKey "${member.userKey}"`);
      } else if (memberEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        problems.push(
          `${at}: email "${member.email}" does not match user "${user.key}" email "${user.email}"`
        );
      }
      claim(problems, linkedUsers, member.userKey, `${at}: user "${member.userKey}" linked twice`);
    }
  }
  for (const category of group.categories) {
    const at = `${where} category "${category.key}"`;
    claim(problems, categoryKeys, category.key, `${at}: duplicate category key`);
    checkDocId(problems, at, category.key);
  }

  const knownMember = (at: string, role: string, key: string) => {
    if (!memberKeys.has(key)) problems.push(`${at}: unknown ${role} member key "${key}"`);
  };

  const checkSplitPlan = (at: string, plan: SeedExpense | SeedMemorized): void => {
    knownMember(at, 'paidBy', plan.paidByKey);
    if (!categoryKeys.has(plan.categoryKey)) {
      problems.push(`${at}: unknown category key "${plan.categoryKey}"`);
    }
    if (plan.splits.length === 0) problems.push(`${at}: has no splits`);
    const owedBy = new Set<string>();
    for (const split of plan.splits) {
      knownMember(at, 'owedBy', split.owedByKey);
      claim(problems, owedBy, split.owedByKey, `${at}: member "${split.owedByKey}" split twice`);
    }
    validateSplitMethod(problems, at, plan, group.decimalPlaces ?? 2);
  };

  for (const expense of group.expenses ?? []) {
    const at = `${where} expense "${expense.key}"`;
    claim(problems, expenseKeys, expense.key, `${at}: duplicate expense key`);
    checkDocId(problems, at, expense.key);
    checkDate(problems, at, expense.date);
    checkSplitPlan(at, expense);
    if (expense.rental !== undefined) validateRental(problems, at, expense, memberKeys);
    if (expense.receipt !== undefined) validateReceipt(problems, at, expense.receipt);
  }

  for (const memorized of group.memorized ?? []) {
    const at = `${where} memorized "${memorized.key}"`;
    claim(problems, memorizedKeys, memorized.key, `${at}: duplicate memorized key`);
    checkDocId(problems, at, memorized.key);
    if (memorized.description.trim() === '') problems.push(`${at}: description is blank`);
    checkSplitPlan(at, memorized);
  }

  for (const payment of group.payments ?? []) {
    const at = `${where} payment "${payment.key}"`;
    claim(problems, paymentKeys, payment.key, `${at}: duplicate payment key`);
    checkDocId(problems, at, payment.key);
    checkDate(problems, at, payment.date);
    knownMember(at, 'paidBy', payment.paidByKey);
    knownMember(at, 'paidTo', payment.paidToKey);
    if (payment.paidByKey === payment.paidToKey) {
      problems.push(`${at}: paidBy and paidTo are the same member`);
    }
    if (payment.expenseKeys.length === 0) problems.push(`${at}: has no expenseKeys`);
    for (const expenseKey of payment.expenseKeys) {
      if (!expenseKeys.has(expenseKey)) {
        problems.push(`${at}: unknown expense key "${expenseKey}"`);
      }
    }
  }
}

// Slack allowed when summing percentages (float error only, not rounding).
const PERCENTAGE_TOLERANCE = 0.01;

const SPLIT_FIELDS = ['assignedAmount', 'percentage', 'shares'] as const;
const SPLIT_FIELD_OF_METHOD: Record<SeedExpense['splitMethod'], (typeof SPLIT_FIELDS)[number]> = {
  amount: 'assignedAmount',
  percentage: 'percentage',
  shares: 'shares',
};

/**
 * Checks an expense's split inputs against its splitMethod, using the same
 * rules write.ts/allocation.ts apply: percentage splits must total 100 (write
 * would silently absorb a remainder into the last split), every share must be
 * positive, and an amount expense's assigned amounts plus its shared and
 * allocated pools must equal the total (allocateSharedAmounts would otherwise
 * quietly rewrite the shared pool). Fields that belong to another method are
 * rejected because write.ts would silently ignore them.
 */
function validateSplitMethod(
  problems: string[],
  at: string,
  expense: SeedExpense | SeedMemorized,
  decimalPlaces: number
): void {
  const method = expense.splitMethod;
  const round = (value: number) => {
    const multiplier = Math.pow(10, decimalPlaces);
    return Math.round(value * multiplier) / multiplier;
  };

  if (method !== 'amount') {
    for (const field of ['sharedAmount', 'allocatedAmount'] as const) {
      if (expense[field] !== undefined) {
        problems.push(`${at}: ${field} is only valid for splitMethod 'amount' (this is '${method}')`);
      }
    }
  }
  for (const split of expense.splits) {
    const splitAt = `${at} split "${split.owedByKey}"`;
    const used = SPLIT_FIELD_OF_METHOD[method];
    const unused = SPLIT_FIELDS.filter((field) => field !== used && split[field] !== undefined);
    for (const field of unused) {
      problems.push(`${splitAt}: ${field} is not used by splitMethod '${method}'`);
    }
  }

  if (method === 'amount') {
    const assigned = expense.splits.reduce((t, s) => t + (s.assignedAmount ?? 0), 0);
    const sum = round(assigned + (expense.sharedAmount ?? 0) + (expense.allocatedAmount ?? 0));
    if (sum !== round(expense.totalAmount)) {
      problems.push(
        `${at}: amount split adds up to ${sum} (assigned + sharedAmount + allocatedAmount) but the total is ${expense.totalAmount}`
      );
    }
  } else if (method === 'percentage') {
    for (const split of expense.splits) {
      if (split.percentage === undefined) {
        problems.push(`${at} split "${split.owedByKey}": percentage is required for splitMethod 'percentage'`);
      }
    }
    // Percentages are not money: a fixed tolerance, not the group's decimalPlaces
    // (a 0-decimal group would otherwise accept 99.6 to 100.4).
    const total = expense.splits.reduce((t, s) => t + (s.percentage ?? 0), 0);
    if (Math.abs(total - 100) > PERCENTAGE_TOLERANCE) {
      problems.push(`${at}: percentages total ${Number(total.toFixed(4))} but must be 100`);
    }
  } else {
    for (const split of expense.splits) {
      if (!((split.shares ?? 0) > 0)) {
        problems.push(
          `${at} split "${split.owedByKey}": shares must be greater than 0 (got ${split.shares})`
        );
      }
    }
  }
}

/**
 * Checks a rental's occupancy: it belongs on a shares expense, every stay is
 * a group member (once), each night is a whole number in [0, nightCount),
 * every night has somebody present, and each roomId is one of the rooms.
 */
function validateRental(
  problems: string[],
  at: string,
  expense: SeedExpense,
  memberKeys: Set<string>
): void {
  const rental = expense.rental!;
  if (expense.splitMethod !== 'shares') {
    problems.push(
      `${at}: rental is only valid for splitMethod 'shares' (this is '${expense.splitMethod}')`
    );
  }
  if (!Number.isInteger(rental.nightCount) || rental.nightCount < 1) {
    problems.push(`${at}: rental nightCount must be a positive integer (got ${rental.nightCount})`);
    return;
  }

  const roomIds = new Set<string>();
  for (const room of rental.rooms ?? []) {
    claim(problems, roomIds, room.id, `${at}: rental has a duplicate room id "${room.id}"`);
    if (Number.isNaN(room.rate) || room.rate <= 0) {
      problems.push(`${at}: rental room "${room.id}" rate must be greater than 0 (got ${room.rate})`);
    }
  }

  const present = new Array<number>(rental.nightCount).fill(0);
  const stayers = new Set<string>();
  for (const stay of rental.stays) {
    if (!memberKeys.has(stay.memberKey)) {
      problems.push(`${at}: rental stay has unknown member key "${stay.memberKey}"`);
    }
    claim(
      problems,
      stayers,
      stay.memberKey,
      `${at}: rental has two stays for member "${stay.memberKey}"`
    );
    if (stay.roomId !== undefined && !roomIds.has(stay.roomId)) {
      problems.push(
        `${at}: rental stay "${stay.memberKey}" roomId "${stay.roomId}" is not in rooms`
      );
    }
    for (const night of new Set(stay.nights)) {
      if (Number.isInteger(night) && night >= 0 && night < rental.nightCount) {
        present[night]!++;
      } else {
        problems.push(
          `${at}: rental stay "${stay.memberKey}" night ${night} is outside 0..${rental.nightCount - 1} (nightCount ${rental.nightCount})`
        );
      }
    }
  }
  present.forEach((count, night) => {
    if (count === 0) problems.push(`${at}: rental night ${night} has nobody present`);
  });
}

/** leftGroup and invite only make sense on certain members; see SeedMember. */
function validateMemberState(problems: string[], at: string, member: SeedMember): void {
  if (member.leftGroup === true && (member.active ?? true)) {
    problems.push(`${at}: leftGroup requires active: false (leaveGroup deactivates the member)`);
  }
  const { invite } = member;
  if (invite === undefined) return;
  checkNonNegative(problems, at, 'invite.sentDaysAgo', invite.sentDaysAgo);
  if (!Number.isInteger(invite.sendCount) || invite.sendCount < 1) {
    problems.push(`${at}: invite.sendCount must be a positive integer (got ${invite.sendCount})`);
  }
  if ((member.email ?? '').trim() === '') {
    problems.push(`${at}: invite needs a member email (it is recorded as lastSentTo)`);
  }
}

function validateReceipt(
  problems: string[],
  at: string,
  receipt: NonNullable<SeedExpense['receipt']>
): void {
  const resolved = fixtureFilePath(receipt.file);
  if (resolved === undefined || !existsSync(resolved)) {
    problems.push(`${at}: receipt file "${receipt.file}" does not exist under e2e/fixtures/files`);
  }
  if (receipt.contentType.trim() === '') problems.push(`${at}: receipt contentType is blank`);
}

function checkNonNegative(problems: string[], where: string, field: string, value: number): void {
  if (!(Number.isFinite(value) && value >= 0)) {
    problems.push(`${where}: ${field} must be a number >= 0 (got ${value})`);
  }
}

/** Adds `value` to `seen`, recording `problem` if it was already there. */
function claim(problems: string[], seen: Set<string>, value: string, problem: string): void {
  if (seen.has(value)) problems.push(problem);
  seen.add(value);
}

function checkDocId(problems: string[], where: string, id: string): void {
  if (id.trim() === '' || id.includes('/')) {
    problems.push(`${where}: "${id}" is not a valid Firestore document ID`);
  }
}

function checkDate(problems: string[], where: string, date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    problems.push(`${where}: date "${date}" must be YYYY-MM-DD`);
  }
}
