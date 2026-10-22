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
 * - email-rules-creator (no group) deletes their own users doc, tries
 *   invalid creates and creates with someone else's address, then recreates
 *   it with their own address (users may create only their own doc), so it
 *   repeats fine.
 *
 * Email ownership (a profile may store only '' or the caller's own verified
 * address, Plan 4 B14):
 * - Ezra's own-doc tests write his address in other casings and try other
 *   valid addresses, ending on the seeded address.
 * - email-rules-unverified (no group, Auth address unverified; the profile
 *   email is '' as the sign-up trigger leaves it) tries to store its own and
 *   other addresses and makes unrelated writes. Nothing it tries is allowed
 *   to change the email, so it repeats fine.
 * - email-rules-unverified-creator (no group, unverified) deletes its own
 *   doc, tries creates with its own address and recreates it with '', so it
 *   repeats fine.
 * - email-rules-late-verify (no group) is the profile-creation fallback:
 *   signed in while unverified, verified elsewhere (Admin SDK), its stale
 *   token can't store the address, '' then a refreshed token can. The test
 *   marks it unverified again first, so it repeats fine.
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

const creator: SeedUser = {
  key: 'email-rules-creator',
  uid: 'u-email-rules-creator',
  email: 'email-rules-creator@pipsplit.test',
  password: PASSWORD,
};

const unverified: SeedUser = {
  key: 'email-rules-unverified',
  uid: 'u-email-rules-unverified',
  email: 'email-rules-unverified@pipsplit.test',
  password: PASSWORD,
  emailVerified: false,
};

const unverifiedCreator: SeedUser = {
  key: 'email-rules-unverified-creator',
  uid: 'u-email-rules-unverified-creator',
  email: 'email-rules-unverified-creator@pipsplit.test',
  password: PASSWORD,
  emailVerified: false,
};

const lateVerify: SeedUser = {
  key: 'email-rules-late-verify',
  uid: 'u-email-rules-late-verify',
  email: 'email-rules-late-verify@pipsplit.test',
  password: PASSWORD,
  emailVerified: false,
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
  creator,
  unverified,
  unverifiedCreator,
  lateVerify,
  group,
  target,
  legacyList,
  legacyNull,
} as const;

export const EMAIL_RULES_DATASET: SeedDataset = {
  name: 'email-rules',
  users: [
    admin,
    legacyUser,
    creator,
    unverified,
    unverifiedCreator,
    lateVerify,
  ],
  groups: [group],
};
