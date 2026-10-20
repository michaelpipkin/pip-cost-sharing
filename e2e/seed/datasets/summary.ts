import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/critical-flows/summary.spec.ts. Read-only: only the
 * empty-state test uses it, and it changes nothing.
 *
 * - summary-user, only in "Summary – Empty": two members and a category but
 *   no expenses, so Summary shows its no-unpaid-splits placeholder. It is
 *   the user's only (and default) group, so sign-in lands on it.
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

export const SUMMARY = {
  users: { summaryUser },
  groups: { empty },
} as const;

export const SUMMARY_DATASET: SeedDataset = {
  name: 'summary',
  users: Object.values(SUMMARY.users),
  groups: Object.values(SUMMARY.groups),
};
