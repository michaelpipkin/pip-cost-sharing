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
 * - summary-handles-pat (Pat), "Summary – Handles": owes 20.00 to each of two
 *   payees who both have payment handles, so Pay opens one dialog per payee
 *   (the handles come from the getMemberPaymentMethods callable). Pat signs
 *   in; the payees never do. Everything is read-only except the unlink below.
 *   - summary-handles-lou (Lou): a linked member; the dialog lists his handles.
 *   - summary-handles-una (Una): seeded linked too, but the Pay test unlinks
 *     her row through the Admin SDK first (idempotent; userRef null does not
 *     re-link, the trigger only links on create or an email change), so the
 *     row is an unlinked member whose address belongs to a user with
 *     handles: the dialog must show none for her.
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

const handlesPat: SeedUser = {
  key: 'summary-handles-pat',
  uid: 'u-summary-handles-pat',
  email: 'summary-handles-pat@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-summary-handles' },
};

const handlesLou: SeedUser = {
  key: 'summary-handles-lou',
  uid: 'u-summary-handles-lou',
  email: 'summary-handles-lou@pipsplit.test',
  password: PASSWORD,
  profile: {
    defaultGroupKey: 'g-summary-handles',
    venmoId: 'lou-venmo',
    paypalId: 'lou-paypal@pipsplit.test',
  },
};

const handlesUna: SeedUser = {
  key: 'summary-handles-una',
  uid: 'u-summary-handles-una',
  email: 'summary-handles-una@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-summary-handles', venmoId: 'una-venmo' },
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

const handles: SeedGroup = {
  key: 'g-summary-handles',
  owner: SPEC,
  name: 'Summary – Handles',
  members: [
    {
      key: 'pat',
      displayName: 'Pat',
      email: handlesPat.email,
      userKey: handlesPat.key,
      groupAdmin: true,
    },
    {
      key: 'lou',
      displayName: 'Lou',
      email: handlesLou.email,
      userKey: handlesLou.key,
    },
    {
      key: 'una',
      displayName: 'Una',
      email: handlesUna.email,
      userKey: handlesUna.key,
    },
  ],
  categories: [{ key: 'food', name: 'Food' }],
  expenses: [
    {
      key: 'e-summary-handles-lou-lunch',
      date: seedDaysAgo(4),
      description: 'Summary – Handles lou lunch',
      categoryKey: 'food',
      paidByKey: 'lou',
      totalAmount: 40,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'lou', assignedAmount: 20 },
        { owedByKey: 'pat', assignedAmount: 20 },
      ],
    },
    {
      key: 'e-summary-handles-una-lunch',
      date: seedDaysAgo(3),
      description: 'Summary – Handles una lunch',
      categoryKey: 'food',
      paidByKey: 'una',
      totalAmount: 40,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'una', assignedAmount: 20 },
        { owedByKey: 'pat', assignedAmount: 20 },
      ],
    },
  ],
};

export const SUMMARY = {
  users: {
    summaryUser,
    summaryPayee,
    summaryPayer,
    handlesPat,
    handlesLou,
    handlesUna,
  },
  groups: { empty, request, handles },
} as const;

export const SUMMARY_DATASET: SeedDataset = {
  name: 'summary',
  users: Object.values(SUMMARY.users),
  groups: Object.values(SUMMARY.groups),
};
