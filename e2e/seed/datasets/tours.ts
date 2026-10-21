import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/tours/tours.spec.ts. Read-only: a guided tour never writes, so
 * every test signs in as tours-user and none of them changes anything.
 *
 * - tours-user is Ari, the admin of "Tours – Home", their only and default
 *   group (signing in writes nothing). The other member, Blake, is a
 *   placeholder (no email), so the group has two members and the Members
 *   tour, which adds sample members when you are alone, uses the real ones.
 *   (Split is signed out and uses no group.)
 * - Two categories (General, Travel), so the category field is shown.
 * - Two expenses, both paid by Ari and split evenly with Blake:
 *   - "Tours – Dinner" ($40, unpaid): the row the Expenses list shows (it
 *     lists unpaid expenses by default), the expense Edit Expense opens, and
 *     what keeps Summary on real balances (Blake owes Ari $20);
 *   - "Tours – Lunch" ($30, settled): exists to carry the payment below.
 * - One memorized expense, "Tours – Rent" ($100, Ari 50 / Blake 50).
 * - One payment, Blake -> Ari ($15, settling "Tours – Lunch"), the row
 *   History lists and the payment detail page opens.
 */

const SPEC = 'spec:e2e/tours/tours.spec.ts' as const;

const user: SeedUser = {
  key: 'tours-user',
  uid: 'u-tours-user',
  email: 'tours-user@pipsplit.test',
  password: 'Seed-Pass-123!',
  profile: { defaultGroupKey: 'g-tours-home' },
};

const home: SeedGroup = {
  key: 'g-tours-home',
  owner: SPEC,
  name: 'Tours – Home',
  members: [
    {
      key: 'ari',
      displayName: 'Ari',
      email: user.email,
      userKey: user.key,
      groupAdmin: true,
    },
    { key: 'blake', displayName: 'Blake', email: '' },
  ],
  categories: [
    { key: 'general', name: 'General' },
    { key: 'travel', name: 'Travel' },
  ],
  expenses: [
    {
      key: 'e-tours-dinner',
      date: seedDaysAgo(3),
      description: 'Tours – Dinner',
      categoryKey: 'general',
      paidByKey: 'ari',
      totalAmount: 40,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ari', assignedAmount: 20 },
        { owedByKey: 'blake', assignedAmount: 20 },
      ],
    },
    {
      key: 'e-tours-lunch',
      date: seedDaysAgo(5),
      description: 'Tours – Lunch',
      categoryKey: 'general',
      paidByKey: 'ari',
      totalAmount: 30,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ari', assignedAmount: 15 },
        { owedByKey: 'blake', assignedAmount: 15 },
      ],
    },
  ],
  memorized: [
    {
      key: 'm-tours-rent',
      description: 'Tours – Rent',
      categoryKey: 'general',
      paidByKey: 'ari',
      totalAmount: 100,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ari', assignedAmount: 50 },
        { owedByKey: 'blake', assignedAmount: 50 },
      ],
    },
  ],
  payments: [
    {
      key: 'p-tours-blake-ari',
      date: seedDaysAgo(1),
      paidByKey: 'blake',
      paidToKey: 'ari',
      expenseKeys: ['e-tours-lunch'],
    },
  ],
};

export const TOURS = {
  user,
  group: home,
  /** The unpaid expense (listed by Expenses, opened by Edit Expense). */
  expense: { key: 'e-tours-dinner', description: 'Tours – Dinner' },
  memorized: { key: 'm-tours-rent', description: 'Tours – Rent' },
} as const;

export const TOURS_DATASET: SeedDataset = {
  name: 'tours',
  users: [user],
  groups: [home],
};
