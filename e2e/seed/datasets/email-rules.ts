import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/infra/email-rules.spec.ts, which checks the Firestore rules'
 * email guard (isValidEmailOrEmpty) through the client SDK; it never opens
 * the app.
 *
 * - email-rules-admin (Ezra, group admin) in "Email Rules – Main", their only
 *   and default group. The spec signs in as Ezra, writes email values to
 *   Ezra's own users doc (ending each test on the seeded address) and to the
 *   placeholder member "Rule Target", and creates members with unique ids.
 *   Nothing else reads this group or user.
 */

const SPEC = 'spec:e2e/infra/email-rules.spec.ts' as const;
const GROUP_KEY = 'g-email-rules-main';

const admin: SeedUser = {
  key: 'email-rules-admin',
  uid: 'u-email-rules-admin',
  email: 'email-rules-admin@pipsplit.test',
  password: 'Seed-Pass-123!',
  profile: { defaultGroupKey: GROUP_KEY },
};

const target = {
  key: 'email-rules-target',
  displayName: 'Rule Target',
  email: 'email-rules-target@pipsplit.test',
} as const;

const group: SeedGroup = {
  key: GROUP_KEY,
  owner: SPEC,
  name: 'Email Rules – Main',
  members: [
    {
      key: 'email-rules-ezra',
      displayName: 'Ezra',
      email: admin.email,
      userKey: admin.key,
      groupAdmin: true,
    },
    target,
  ],
  categories: [{ key: 'email-rules-general', name: 'General' }],
};

export const EMAIL_RULES = { admin, group, target } as const;

export const EMAIL_RULES_DATASET: SeedDataset = {
  name: 'email-rules',
  users: [admin],
  groups: [group],
};
