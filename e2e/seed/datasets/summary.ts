import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/critical-flows/summary.spec.ts.
 *
 * - summary-user, only in "Summary – Empty": two members and a category but
 *   no expenses, so Summary shows its no-unpaid-splits placeholder. It is
 *   the user's only (and default) group, so sign-in lands on it. Read-only.
 * - summary-payee (Pia, with a Venmo ID) and summary-payer (Pax), only in
 *   "Summary – Request": one expense Pia paid (40.00, split 20/20), so Pax
 *   owes Pia 20.00. The payment-request test signs in as summary-payee and
 *   emails Pax; summary-payer never signs in and is the only recipient of
 *   that mail (no payments are seeded, so nothing else mails either user).
 *   Each is linked only to this group, which is their default.
 *
 * Every other summary test reads SHARED ("Shared – Beach House") as alice.
 */

const SPEC = 'spec:e2e/critical-flows/summary.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const summaryUser: SeedUser = {
  key: 'summary-user',
  uid: 'u-summary-user',
  email: 'summary-user@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-summary-empty' },
};

const summaryPayee: SeedUser = {
  key: 'summary-payee',
  uid: 'u-summary-payee',
  email: 'summary-payee@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-summary-request', venmoId: 'pia-pays' },
};

const summaryPayer: SeedUser = {
  key: 'summary-payer',
  uid: 'u-summary-payer',
  email: 'summary-payer@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-summary-request' },
};

const empty: SeedGroup = {
  key: 'g-summary-empty',
  owner: SPEC,
  name: 'Summary – Empty',
  members: [
    {
      key: 'sky',
      displayName: 'Sky',
      email: summaryUser.email,
      userKey: summaryUser.key,
      groupAdmin: true,
    },
    { key: 'river', displayName: 'River', email: '' },
  ],
  categories: [{ key: 'general', name: 'General' }],
};

const request: SeedGroup = {
  key: 'g-summary-request',
  owner: SPEC,
  name: 'Summary – Request',
  members: [
    {
      key: 'pia',
      displayName: 'Pia',
      email: summaryPayee.email,
      userKey: summaryPayee.key,
      groupAdmin: true,
    },
    {
      key: 'pax',
      displayName: 'Pax',
      email: summaryPayer.email,
      userKey: summaryPayer.key,
    },
  ],
  categories: [{ key: 'food', name: 'Food' }],
  expenses: [
    {
      key: 'e-summary-request-lunch',
      date: seedDaysAgo(4),
      description: 'Summary – Request lunch',
      categoryKey: 'food',
      paidByKey: 'pia',
      totalAmount: 40,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'pia', assignedAmount: 20 },
        { owedByKey: 'pax', assignedAmount: 20 },
      ],
    },
  ],
};

export const SUMMARY = {
  users: { summaryUser, summaryPayee, summaryPayer },
  groups: { empty, request },
} as const;

export const SUMMARY_DATASET: SeedDataset = {
  name: 'summary',
  users: Object.values(SUMMARY.users),
  groups: Object.values(SUMMARY.groups),
};
