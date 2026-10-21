import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/receipts/receipts.spec.ts. One user per group, and each
 * user's only (and default) group is their group, so signing in writes
 * nothing to the user doc except what a test is about (receiptPolicy). Every
 * user is Ari, the group's admin. Every group has the categories General
 * and Travel (two, so the category select shows and nothing is preselected)
 * and does not auto-add members, so Add Expense starts with no splits.
 *
 * - receipts-attach, "Receipts – Attach" (Ari, Blake), receiptPolicy true:
 *   the attach test adds an expense with a receipt.
 * - receipts-policy, "Receipts – Policy" (Ari, Blake), NO receiptPolicy yet:
 *   the policy test accepts it, which is one-way state on this user, so no
 *   other test signs in as them.
 * - receipts-view, "Receipts – View" (Ari, Blake), receiptPolicy true, one
 *   expense ("View – Dinner receipt", $40) carrying a stored receipt
 *   (e2e/fixtures/files/receipt.png at
 *   groups/g-receipts-view/receipts/e-receipts-view-dinner). Read-only.
 * - receipts-scan, "Receipts – Scan" (Ari, Blake, Cody), receiptPolicy true:
 *   the scan test turns a mocked receipt into an expense.
 */

const SPEC = 'spec:e2e/receipts/receipts.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

function makeUser(name: string, receiptPolicy: boolean): SeedUser {
  return {
    key: `receipts-${name}`,
    uid: `u-receipts-${name}`,
    email: `receipts-${name}@pipsplit.test`,
    password: PASSWORD,
    profile: {
      defaultGroupKey: `g-receipts-${name}`,
      ...(receiptPolicy ? { receiptPolicy: true } : {}),
    },
  };
}

const users = {
  attach: makeUser('attach', true),
  policy: makeUser('policy', false),
  view: makeUser('view', true),
  scan: makeUser('scan', true),
};

function ari(user: SeedUser): SeedMember {
  return {
    key: 'ari',
    displayName: 'Ari',
    email: user.email,
    userKey: user.key,
    groupAdmin: true,
  };
}

const blake: SeedMember = { key: 'blake', displayName: 'Blake', email: '' };
const cody: SeedMember = { key: 'cody', displayName: 'Cody', email: '' };

const categories = [
  { key: 'general', name: 'General' },
  { key: 'travel', name: 'Travel' },
];

function makeGroup(
  name: keyof typeof users,
  title: string,
  members: SeedMember[],
  expenses?: SeedGroup['expenses']
): SeedGroup {
  return {
    key: `g-receipts-${name}`,
    owner: SPEC,
    name: `Receipts – ${title}`,
    members: [ari(users[name]), ...members],
    categories,
    expenses,
  };
}

const VIEW_EXPENSE = {
  key: 'e-receipts-view-dinner',
  description: 'View – Dinner receipt',
  total: 40,
};

export const RECEIPTS = {
  users,
  groups: {
    attach: makeGroup('attach', 'Attach', [blake]),
    policy: makeGroup('policy', 'Policy', [blake]),
    view: makeGroup('view', 'View', [blake], [
      {
        key: VIEW_EXPENSE.key,
        date: seedDaysAgo(3),
        description: VIEW_EXPENSE.description,
        categoryKey: 'general',
        paidByKey: 'ari',
        totalAmount: VIEW_EXPENSE.total,
        splitMethod: 'amount',
        splits: [
          { owedByKey: 'ari', assignedAmount: 20 },
          { owedByKey: 'blake', assignedAmount: 20 },
        ],
        receipt: { file: 'receipt.png', contentType: 'image/png' },
      },
    ]),
    scan: makeGroup('scan', 'Scan', [blake, cody]),
  },
  /** The seeded expense with a stored receipt in "Receipts – View". */
  viewExpense: VIEW_EXPENSE,
} as const;

export const RECEIPTS_DATASET: SeedDataset = {
  name: 'receipts',
  users: Object.values(RECEIPTS.users),
  groups: Object.values(RECEIPTS.groups),
};
