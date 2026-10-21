import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/members/members.spec.ts.
 *
 * - members-admin (Ari, group admin) in "Members – Main", their only and
 *   default group. The three admin tests share the group and the user
 *   (nobody switches groups or changes user-level state); each works on its
 *   own placeholder member (no email, never signs in):
 *   - "Edit Me": renamed and made a group admin by the edit test;
 *   - "Remove Me" (no splits): removed by the remove test;
 *   - "Has Splits": in the one seeded expense, so removing them is refused.
 * - members-leaver in "Members – Leave" (default) as Lee, a non-admin. The
 *   group's admin is Dana, a placeholder member, so Lee is not the only
 *   admin. Lee has no splits, so leaving deletes their member doc. Lee's
 *   home group is "Members – Leave Home" (Lee is its admin), which the app
 *   falls back to after leaving.
 */

const SPEC = 'spec:e2e/members/members.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

function makeUser(name: string, defaultGroupKey: string): SeedUser {
  return {
    key: `members-${name}`,
    uid: `u-members-${name}`,
    email: `members-${name}@pipsplit.test`,
    password: PASSWORD,
    profile: { defaultGroupKey },
  };
}

const users = {
  admin: makeUser('admin', 'g-members-main'),
  leaver: makeUser('leaver', 'g-members-leave'),
};

const categories = [{ key: 'general', name: 'General' }];

/** The placeholder members of "Members – Main"; `key` is the row's id. */
const placeholders = {
  edit: { key: 'edit-me', displayName: 'Edit Me', email: '' },
  remove: { key: 'remove-me', displayName: 'Remove Me', email: '' },
  hasSplits: { key: 'has-splits', displayName: 'Has Splits', email: '' },
} as const;

const main: SeedGroup = {
  key: 'g-members-main',
  owner: SPEC,
  name: 'Members – Main',
  members: [
    {
      key: 'ari',
      displayName: 'Ari',
      email: users.admin.email,
      userKey: users.admin.key,
      groupAdmin: true,
    },
    ...Object.values(placeholders),
  ],
  categories,
  expenses: [
    {
      key: 'e-members-has-splits',
      date: seedDaysAgo(2),
      description: 'Members – Has Splits expense',
      categoryKey: 'general',
      paidByKey: 'ari',
      totalAmount: 20,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ari', assignedAmount: 10 },
        { owedByKey: placeholders.hasSplits.key, assignedAmount: 10 },
      ],
    },
  ],
};

const leave: SeedGroup = {
  key: 'g-members-leave',
  owner: SPEC,
  name: 'Members – Leave',
  members: [
    { key: 'dana', displayName: 'Dana', email: '', groupAdmin: true },
    {
      key: 'lee',
      displayName: 'Lee',
      email: users.leaver.email,
      userKey: users.leaver.key,
    },
  ],
  categories,
};

const leaveHome: SeedGroup = {
  key: 'g-members-leave-home',
  owner: SPEC,
  name: 'Members – Leave Home',
  members: [
    {
      key: 'lee',
      displayName: 'Lee',
      email: users.leaver.email,
      userKey: users.leaver.key,
      groupAdmin: true,
    },
  ],
  categories,
};

export const MEMBERS = {
  users,
  groups: { main, leave, leaveHome },
  placeholders,
  /** Lee's member in "Members – Leave" (its row id). */
  leaverMemberKey: 'lee',
} as const;

export const MEMBERS_DATASET: SeedDataset = {
  name: 'members',
  users: Object.values(users),
  groups: [main, leave, leaveHome],
};
