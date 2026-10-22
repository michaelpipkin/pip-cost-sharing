import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/infra/email-rules.spec.ts, which checks the Firestore rules'
 * email guard (emailCreateValid / emailUpdateValid) through the client SDK;
 * it never opens the app. Nothing else reads this group or these users.
 *
 * - email-rules-admin (Ezra, group admin) in "Email Rules – Main", their only
 *   and default group. Most tests sign in as Ezra and write:
 *   - Ezra's own users doc (each test ends on the seeded address);
 *   - "Rule Target", a placeholder member (ends on its seeded address);
 *   - "Legacy List", a placeholder whose stored email is a comma list (a
 *     value from before the rule). Its test changes it to valid, then '',
 *     so that test is one-shot per seeding;
 *   - "Legacy Null", a placeholder whose stored email is null (likewise
 *     one-shot);
 *   - new members with unique ids.
 * - email-rules-legacy (no group) signs in to update their own users doc,
 *   whose stored email is a comma list (`storedEmail`); the Auth address is
 *   a normal one. Its test only makes unrelated writes and denied changes,
 *   so it repeats fine.
 */

const SPEC = 'spec:e2e/infra/email-rules.spec.ts' as const;
const GROUP_KEY = 'g-email-rules-main';
const PASSWORD = 'Seed-Pass-123!';

const admin: SeedUser = {
  key: 'email-rules-admin',
  uid: 'u-email-rules-admin',
  email: 'email-rules-admin@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: GROUP_KEY },
};

const LEGACY_LIST_EMAIL =
  'email-rules-list-a@pipsplit.test,email-rules-list-b@pipsplit.test';

const legacyUser: SeedUser = {
  key: 'email-rules-legacy',
  uid: 'u-email-rules-legacy',
  email: 'email-rules-legacy@pipsplit.test',
  password: PASSWORD,
  profile: {
    storedEmail:
      'email-rules-legacy@pipsplit.test,email-rules-other@pipsplit.test',
  },
};

const target = {
  key: 'email-rules-target',
  displayName: 'Rule Target',
  email: 'email-rules-target@pipsplit.test',
} as const;

const legacyList = {
  key: 'email-rules-legacy-list',
  displayName: 'Legacy List',
  email: LEGACY_LIST_EMAIL,
} as const;

const legacyNull = {
  key: 'email-rules-legacy-null',
  displayName: 'Legacy Null',
  email: null,
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
    legacyList,
    legacyNull,
  ],
  categories: [{ key: 'email-rules-general', name: 'General' }],
};

export const EMAIL_RULES = {
  admin,
  legacyUser,
  group,
  target,
  legacyList,
  legacyNull,
} as const;

export const EMAIL_RULES_DATASET: SeedDataset = {
  name: 'email-rules',
  users: [admin, legacyUser],
  groups: [group],
};
