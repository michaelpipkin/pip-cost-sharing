import type { SeedDataset, SeedExpense, SeedGroup, SeedUser } from './types';

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
  const paymentKeys = new Set<string>();
  const linkedUsers = new Set<string>();
  const memberEmails = new Set<string>();

  for (const member of group.members) {
    const at = `${where} member "${member.key}"`;
    claim(problems, memberKeys, member.key, `${at}: duplicate member key`);
    checkDocId(problems, at, member.key);
    if (member.email.trim() !== '') {
      checkEmail(at, member.email);
      claim(
        problems,
        memberEmails,
        member.email.trim().toLowerCase(),
        `${at}: duplicate member email "${member.email}" (compared case-insensitively)`
      );
    }
    if (member.userKey !== undefined) {
      const user = usersByKey.get(member.userKey);
      if (user === undefined) {
        problems.push(`${at}: unknown userKey "${member.userKey}"`);
      } else if (member.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
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

  for (const expense of group.expenses ?? []) {
    const at = `${where} expense "${expense.key}"`;
    claim(problems, expenseKeys, expense.key, `${at}: duplicate expense key`);
    checkDocId(problems, at, expense.key);
    checkDate(problems, at, expense.date);
    knownMember(at, 'paidBy', expense.paidByKey);
    if (!categoryKeys.has(expense.categoryKey)) {
      problems.push(`${at}: unknown category key "${expense.categoryKey}"`);
    }
    if (expense.splits.length === 0) problems.push(`${at}: has no splits`);
    const owedBy = new Set<string>();
    for (const split of expense.splits) {
      knownMember(at, 'owedBy', split.owedByKey);
      claim(problems, owedBy, split.owedByKey, `${at}: member "${split.owedByKey}" split twice`);
    }
    validateSplitMethod(problems, at, expense, group.decimalPlaces ?? 2);
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
  expense: SeedExpense,
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
    const total = round(expense.splits.reduce((t, s) => t + (s.percentage ?? 0), 0));
    if (total !== 100) {
      problems.push(`${at}: percentages total ${total} but must be 100`);
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
