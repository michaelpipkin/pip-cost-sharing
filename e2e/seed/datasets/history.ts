import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/critical-flows/history.spec.ts.
 *
 * - history-user, only in "History – Delete" (admin, so the payment detail
 *   page offers Unpay Payment): members Hana (the user) and Ivo (a
 *   placeholder, no email). One expense, "History – Delete dinner" (Hana
 *   paid 60.00: Hana 30 self, Ivo 30), settled by p-ivo-hana (Ivo -> Hana,
 *   totalPaid 30.00) - the delete test's target. The delete test unpays it,
 *   so it is gone for the rest of the run: nothing else may read it.
 *   Payment mail (seeded history doc, and the unpay notice) can only reach
 *   history-user, the one linked member.
 * - history-empty, only in "History – Empty": members Jo (the user) and Kai,
 *   no expenses or payments, so History shows its no-history placeholder.
 *
 * Each user has exactly one group, which is also their default, so sign-in
 * lands on it and no test switches groups (selecting a group rewrites the
 * user's defaultGroupRef).
 *
 * The display and copy tests read SHARED's Bob -> Alice payment instead.
 */

const SPEC = 'spec:e2e/critical-flows/history.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const historyUser: SeedUser = {
  key: 'history-user',
  uid: 'u-history-user',
  email: 'history-user@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-history-delete' },
};

const emptyUser: SeedUser = {
  key: 'history-empty',
  uid: 'u-history-empty',
  email: 'history-empty@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-history-empty' },
};

const deleteGroup: SeedGroup = {
  key: 'g-history-delete',
  owner: SPEC,
  name: 'History – Delete',
  members: [
    {
      key: 'hana',
      displayName: 'Hana',
      email: historyUser.email,
      userKey: historyUser.key,
      groupAdmin: true,
    },
    { key: 'ivo', displayName: 'Ivo', email: '' },
  ],
  categories: [{ key: 'food', name: 'Food' }],
  expenses: [
    {
      key: 'e-history-dinner',
      date: seedDaysAgo(6),
      description: 'History – Delete dinner',
      categoryKey: 'food',
      paidByKey: 'hana',
      totalAmount: 60,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'hana', assignedAmount: 30 },
        { owedByKey: 'ivo', assignedAmount: 30 },
      ],
    },
  ],
  payments: [
    {
      key: 'p-ivo-hana',
      date: seedDaysAgo(2),
      paidByKey: 'ivo',
      paidToKey: 'hana',
      expenseKeys: ['e-history-dinner'],
    },
  ],
};

const emptyGroup: SeedGroup = {
  key: 'g-history-empty',
  owner: SPEC,
  name: 'History – Empty',
  members: [
    {
      key: 'jo',
      displayName: 'Jo',
      email: emptyUser.email,
      userKey: emptyUser.key,
      groupAdmin: true,
    },
    { key: 'kai', displayName: 'Kai', email: '' },
  ],
  categories: [{ key: 'general', name: 'General' }],
};

export const HISTORY = {
  users: { historyUser, emptyUser },
  groups: { deleteGroup, emptyGroup },
} as const;

export const HISTORY_DATASET: SeedDataset = {
  name: 'history',
  users: Object.values(HISTORY.users),
  groups: Object.values(HISTORY.groups),
};
