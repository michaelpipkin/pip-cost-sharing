import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/account/group-email-update.spec.ts (B20: the offer to update
 * group emails after a login-email change, and Account > Profile's Sync).
 *
 * Four users, one per test, because every test changes its user's member
 * emails (the skip test only through the Admin SDK, setting up group C), and
 * the first three also change the login email (the old address stops
 * working). Each user is the admin of three groups, so they have three linked
 * memberships, all seeded on the login email (the seed requires a linked
 * member's email to equal its user's). The test then gives the member in the
 * group whose key ends `-c` a custom address through the Admin SDK, so the
 * user has 2 memberships on the login email and 1 on a different address.
 *
 * - group-email-old, "Group Email Sync – Old A/B/C": "Update old email only"
 *   changes the two on the login email and keeps the custom one.
 * - group-email-all, "Group Email Sync – All A/B/C": "Update all" changes A
 *   and C. The test first adds a member "conflict" to B (linked to an id
 *   with no users doc) on the new login address, so B is skipped as a
 *   duplicate (M2).
 * - group-email-skip, "Group Email Sync – Skip A/B/C": "Not now" changes none.
 * - group-email-sync, "Group Email Sync – Profile A/B/C": Account > Profile's
 *   Sync Member Emails, with no login-email change. The test gives B and C a
 *   custom address and adds a member "conflict" to B (linked to an id with
 *   no users doc) on the login address, so Sync moves C back, skips B as a
 *   duplicate and leaves A (already on it) alone. It resets those docs first,
 *   so it repeats fine.
 *
 * The new login addresses (`newEmailFor`) are never seeded, so each is free
 * until its test claims it: the three login-change tests are one-shot per
 * seeding, like the account email test.
 */

const SPEC = 'spec:e2e/account/group-email-update.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

/** The custom address the `-c` member is given. */
export const CUSTOM_EMAIL = 'group-email-custom@pipsplit.test';

type Variant = 'old' | 'all' | 'skip' | 'sync';
const TITLES: Record<Variant, string> = {
  old: 'Old',
  all: 'All',
  skip: 'Skip',
  sync: 'Profile',
};

/** The address a variant's user moves their login to (never seeded). */
export function newEmailFor(variant: Variant): string {
  return `group-email-${variant}-changed@pipsplit.test`;
}

function makeUser(variant: Variant): SeedUser {
  return {
    key: `group-email-${variant}`,
    uid: `u-group-email-${variant}`,
    email: `group-email-${variant}@pipsplit.test`,
    password: PASSWORD,
    profile: { defaultGroupKey: `g-group-email-${variant}-a` },
  };
}

const MEMBER_KEY = 'gina';

function makeGroups(variant: Variant, user: SeedUser): SeedGroup[] {
  const member: SeedMember = {
    key: MEMBER_KEY,
    displayName: 'Gina',
    email: user.email,
    userKey: user.key,
    groupAdmin: true,
  };
  return (['a', 'b', 'c'] as const).map((letter) => ({
    key: `g-group-email-${variant}-${letter}`,
    owner: SPEC,
    name: `Group Email Sync – ${TITLES[variant]} ${letter.toUpperCase()}`,
    members: [member],
    categories: [{ key: 'general', name: 'General' }],
  }));
}

const users = {
  old: makeUser('old'),
  all: makeUser('all'),
  skip: makeUser('skip'),
  sync: makeUser('sync'),
};

const groups = {
  old: makeGroups('old', users.old),
  all: makeGroups('all', users.all),
  skip: makeGroups('skip', users.skip),
  sync: makeGroups('sync', users.sync),
};

export const GROUP_EMAIL_UPDATE = {
  users,
  groups,
  /** The seeded member key in every group (the user's own membership). */
  memberKey: MEMBER_KEY,
} as const;

export const GROUP_EMAIL_UPDATE_DATASET: SeedDataset = {
  name: 'group-email-update',
  users: Object.values(users),
  groups: Object.values(groups).flat(),
};
