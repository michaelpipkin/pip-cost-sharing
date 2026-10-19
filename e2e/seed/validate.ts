import type { SeedDataset, SeedGroup } from './types';

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
  const groupNames = new Set<string>();

  const checkEmail = (where: string, email: string) => {
    if (!email.trim().toLowerCase().endsWith(SEED_EMAIL_DOMAIN)) {
      problems.push(`${where}: email "${email}" must end in ${SEED_EMAIL_DOMAIN}`);
    }
  };

  for (const dataset of datasets) {
    for (const user of dataset.users) {
      const where = `${dataset.name} user "${user.key}"`;
      claim(problems, userKeys, user.key, `${where}: duplicate user key`);
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
      claim(problems, groupNames, group.name, `${where}: duplicate group name "${group.name}"`);
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
      if (groupKey !== undefined && !groupKeys.has(groupKey)) {
        problems.push(
          `${dataset.name} user "${user.key}": unknown defaultGroupKey "${groupKey}"`
        );
      }
    }
    for (const group of dataset.groups) {
      validateGroup(problems, `${dataset.name} group "${group.key}"`, group, userKeys, checkEmail);
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
  userKeys: Set<string>,
  checkEmail: (where: string, email: string) => void
): void {
  const memberKeys = new Set<string>();
  const categoryKeys = new Set<string>();
  const expenseKeys = new Set<string>();
  const paymentKeys = new Set<string>();
  const linkedUsers = new Set<string>();

  for (const member of group.members) {
    const at = `${where} member "${member.key}"`;
    claim(problems, memberKeys, member.key, `${at}: duplicate member key`);
    checkDocId(problems, at, member.key);
    if (member.email.trim() !== '') checkEmail(at, member.email);
    if (member.userKey !== undefined) {
      if (!userKeys.has(member.userKey)) {
        problems.push(`${at}: unknown userKey "${member.userKey}"`);
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
