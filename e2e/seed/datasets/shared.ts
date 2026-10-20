import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * The read-only baseline every spec may read but never write.
 *
 * alice, bob and carol all have g-shared as their default group. That is not
 * just convenience: on sign-in the app selects a group and writes
 * users/{uid}.defaultGroupRef if it differs (GroupService.getGroup, via
 * autoSelectGroup), so a shared user seeded without it would have their doc
 * changed by the first spec (or the global-setup warm-up, which signs in as
 * carol) to sign in. Seeding the value the app would write means it writes
 * nothing.
 *
 * Expense and payment dates are relative to SEED_TODAY so they stay inside
 * the Expenses page's default 90-day window and History's 30-day window.
 *
 * Unpaid expenses (owedBy -> paidBy):
 *   e-groceries  amount, Alice paid 90.00:      Alice 30 (self), Bob 40, Carol 20
 *   e-rental     percentage, Bob paid 400.00:   Alice 40% 160, Bob 30% 120 (self),
 *                                               Carol 20% 80, Dana 10% 40
 *   e-dinner     shares, Carol paid 150.00:     Alice 2sh 60, Bob 1sh 30,
 *                                               Carol 1sh 30 (self), Dana 1sh 30
 *   e-market     amount + pools, Alice paid 120.00 (30.00 evenly shared,
 *                20.00 proportional, assigned Alice 30 / Bob 20 / Carol 20):
 *                                               Alice 48 (self), Bob 36, Carol 36
 *
 * Paid: e-snacks (amount, Alice paid 50.00: Alice 25 self, Bob 25), settled by
 * p-bob-alice (Bob -> Alice, totalPaid 25.00, one split) - the history doc.
 *
 * Resulting unpaid pairwise balances:
 *   Alice owes Bob   84.00  (160 - 40 - 36)
 *   Alice owes Carol  4.00  (60 - 20 - 36)
 *   Carol owes Bob   50.00  (80 - 30)
 *   Dana owes Bob    40.00
 *   Dana owes Carol  30.00
 * Net per member (+ = is owed): Alice -88.00, Bob +174.00, Carol -16.00,
 * Dana -70.00.
 */

const PASSWORD = 'Seed-Pass-123!';

const admin: SeedUser = {
  key: 'admin',
  // ADMIN_UID_EMU in functions/src/common.ts, so assertAdmin accepts it;
  // the email matches environment.e2e.ts appOwnerEmail for adminGuard.
  uid: 'cgrizSOG69QiNquzKOA69ls8clFm',
  email: 'admin@pipsplit.test',
  password: PASSWORD,
};

const alice: SeedUser = {
  key: 'alice',
  uid: 'u-alice',
  email: 'alice@pipsplit.test',
  password: PASSWORD,
  profile: { venmoId: 'alice-venmo', defaultGroupKey: 'g-shared' },
};

const bob: SeedUser = {
  key: 'bob',
  uid: 'u-bob',
  email: 'bob@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-shared' },
};

const carol: SeedUser = {
  key: 'carol',
  uid: 'u-carol',
  email: 'carol@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-shared' },
};

const group: SeedGroup = {
  key: 'g-shared',
  owner: 'shared',
  name: 'Shared – Beach House',
  members: [
    { key: 'alice', displayName: 'Alice', email: alice.email, userKey: 'alice', groupAdmin: true },
    { key: 'bob', displayName: 'Bob', email: bob.email, userKey: 'bob' },
    { key: 'carol', displayName: 'Carol', email: carol.email, userKey: 'carol' },
    { key: 'dana', displayName: 'Dana', email: '' },
  ],
  categories: [
    { key: 'groceries', name: 'Groceries' },
    { key: 'lodging', name: 'Lodging' },
    { key: 'dining', name: 'Dining' },
  ],
  expenses: [
    {
      key: 'e-groceries',
      date: seedDaysAgo(20),
      description: 'Grocery run',
      categoryKey: 'groceries',
      paidByKey: 'alice',
      totalAmount: 90,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'alice', assignedAmount: 30 },
        { owedByKey: 'bob', assignedAmount: 40 },
        { owedByKey: 'carol', assignedAmount: 20 },
      ],
    },
    {
      key: 'e-rental',
      date: seedDaysAgo(15),
      description: 'Beach house rental',
      categoryKey: 'lodging',
      paidByKey: 'bob',
      totalAmount: 400,
      splitMethod: 'percentage',
      splits: [
        { owedByKey: 'alice', percentage: 40 },
        { owedByKey: 'bob', percentage: 30 },
        { owedByKey: 'carol', percentage: 20 },
        { owedByKey: 'dana', percentage: 10 },
      ],
    },
    {
      key: 'e-dinner',
      date: seedDaysAgo(10),
      description: 'Seafood dinner',
      categoryKey: 'dining',
      paidByKey: 'carol',
      totalAmount: 150,
      splitMethod: 'shares',
      splits: [
        { owedByKey: 'alice', shares: 2 },
        { owedByKey: 'bob', shares: 1 },
        { owedByKey: 'carol', shares: 1 },
        { owedByKey: 'dana', shares: 1 },
      ],
    },
    {
      key: 'e-market',
      date: seedDaysAgo(5),
      description: 'Farmers market',
      categoryKey: 'groceries',
      paidByKey: 'alice',
      totalAmount: 120,
      splitMethod: 'amount',
      sharedAmount: 30,
      allocatedAmount: 20,
      splits: [
        { owedByKey: 'alice', assignedAmount: 30 },
        { owedByKey: 'bob', assignedAmount: 20 },
        { owedByKey: 'carol', assignedAmount: 20 },
      ],
    },
    {
      key: 'e-snacks',
      date: seedDaysAgo(25),
      description: 'Snack run',
      categoryKey: 'groceries',
      paidByKey: 'alice',
      totalAmount: 50,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'alice', assignedAmount: 25 },
        { owedByKey: 'bob', assignedAmount: 25 },
      ],
    },
  ],
  payments: [
    {
      key: 'p-bob-alice',
      date: seedDaysAgo(3),
      paidByKey: 'bob',
      paidToKey: 'alice',
      expenseKeys: ['e-snacks'],
    },
  ],
};

export const SHARED = {
  users: { admin, alice, bob, carol },
  group,
} as const;

export const SHARED_DATASET: SeedDataset = {
  name: 'shared',
  users: Object.values(SHARED.users),
  groups: [group],
};
