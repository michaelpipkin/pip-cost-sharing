import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/critical-flows/expenses.spec.ts. Tests add expenses with
 * unique descriptions and assert only on their own rows; nothing seeded here
 * is edited or deleted.
 *
 * - expenses-user, only in "Expenses – Main": auto-add off, so every test
 *   builds its splits itself. Three active members, listed by displayName
 *   (the order the add-expense form adds them in): Ari (the user), Blake,
 *   Cody. Two categories, so a category must be picked. One seeded, unpaid
 *   expense keeps the Expenses table rendered (a group with none shows a
 *   placeholder instead), so a "this row is absent" check always runs
 *   against a loaded table.
 * - expenses-solo, only in "Expenses – One Category": auto-add on, one
 *   category, members Sam (the user) and Dev - for the auto-select test.
 *
 * Each user has exactly one group, which is also their default, so sign-in
 * always lands on it and no test switches groups. That matters because the
 * tests run in parallel as the same user: selecting a group rewrites the
 * user's defaultGroupRef (and so where a parallel sign-in lands), and a
 * selection made right after sign-in can be overtaken by the app's own
 * in-flight auto-select of the default group.
 */

const SPEC = 'spec:e2e/critical-flows/expenses.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const expensesUser: SeedUser = {
  key: 'expenses-user',
  uid: 'u-expenses-user',
  email: 'expenses-user@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-expenses-main' },
};

const soloUser: SeedUser = {
  key: 'expenses-solo',
  uid: 'u-expenses-solo',
  email: 'expenses-solo@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-expenses-one-category' },
};

const main: SeedGroup = {
  key: 'g-expenses-main',
  owner: SPEC,
  name: 'Expenses – Main',
  autoAddMembers: false,
  members: [
    {
      key: 'ari',
      displayName: 'Ari',
      email: expensesUser.email,
      userKey: expensesUser.key,
      groupAdmin: true,
    },
    { key: 'blake', displayName: 'Blake', email: '' },
    { key: 'cody', displayName: 'Cody', email: '' },
  ],
  categories: [
    { key: 'food', name: 'Food' },
    { key: 'travel', name: 'Travel' },
  ],
  expenses: [
    {
      key: 'e-seeded-lunch',
      date: seedDaysAgo(3),
      description: 'Expenses – Seeded lunch',
      categoryKey: 'food',
      paidByKey: 'ari',
      totalAmount: 30,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ari', assignedAmount: 15 },
        { owedByKey: 'blake', assignedAmount: 15 },
      ],
    },
  ],
};

const oneCategory: SeedGroup = {
  key: 'g-expenses-one-category',
  owner: SPEC,
  name: 'Expenses – One Category',
  autoAddMembers: true,
  members: [
    {
      key: 'sam',
      displayName: 'Sam',
      email: soloUser.email,
      userKey: soloUser.key,
      groupAdmin: true,
    },
    { key: 'dev', displayName: 'Dev', email: '' },
  ],
  categories: [{ key: 'general', name: 'General' }],
};

export const EXPENSES = {
  users: { expensesUser, soloUser },
  groups: { main, oneCategory },
} as const;

export const EXPENSES_DATASET: SeedDataset = {
  name: 'expenses',
  users: Object.values(EXPENSES.users),
  groups: Object.values(EXPENSES.groups),
};
