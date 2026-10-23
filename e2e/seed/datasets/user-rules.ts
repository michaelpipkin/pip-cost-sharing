import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/infra/user-rules.spec.ts, which checks who may write
 * `users/{uid}` (firestore.rules) through the client SDK; it never opens the
 * app. Nothing else reads these groups or users.
 *
 * Attackers (their own docs are never written):
 * - user-rules-admin: admin of "User Rules – A" (default) and "User Rules –
 *   Second", and a plain member of "User Rules – B".
 * - user-rules-member: plain member of "User Rules – A".
 * - user-rules-admin-b: admin of "User Rules – B" (default).
 *
 * One target user per test, so parallel tests never write the same doc. Each
 * test that changes a target's defaultGroupRef first has the target reset it
 * (an own write), so every test repeats fine:
 * - user-rules-own: updates their own handles, emailOptOut and default.
 * - user-rules-creator (no group): deletes and recreates their own doc.
 * - user-rules-batch-admin / user-rules-batch-victim: admin and plain member
 *   of "User Rules – Batch", both defaulting to it. The batch test
 *   deactivates and archives that group (and reactivates it first).
 * - user-rules-single-victim, -profile-victim, -member-victim, -set-victim,
 *   -combo-victim: plain members of "User Rules – A", defaulting to it.
 * - user-rules-b-victim: plain member of "User Rules – B", defaulting to it.
 */

const SPEC = 'spec:e2e/infra/user-rules.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const GROUP_A = 'g-user-rules-a';
const GROUP_B = 'g-user-rules-b';
const GROUP_SECOND = 'g-user-rules-second';
const GROUP_BATCH = 'g-user-rules-batch';

function seedUser(name: string, profile: SeedUser['profile'] = {}): SeedUser {
  const key = `user-rules-${name}`;
  return {
    key,
    uid: `u-${key}`,
    email: `${key}@pipsplit.test`,
    password: PASSWORD,
    profile,
  };
}

const admin = seedUser('admin', { defaultGroupKey: GROUP_A });
const member = seedUser('member', { defaultGroupKey: GROUP_A });
const adminB = seedUser('admin-b', { defaultGroupKey: GROUP_B });
const own = seedUser('own', { defaultGroupKey: GROUP_A, venmoId: '@ur-own' });
const creator = seedUser('creator');
const batchAdmin = seedUser('batch-admin', { defaultGroupKey: GROUP_BATCH });
const batchVictim = seedUser('batch-victim', { defaultGroupKey: GROUP_BATCH });
const singleVictim = seedUser('single-victim', { defaultGroupKey: GROUP_A });
const profileVictim = seedUser('profile-victim', {
  defaultGroupKey: GROUP_A,
  venmoId: '@ur-profile-victim',
  paypalId: 'user-rules-profile-victim@pipsplit.test',
  emailOptOut: false,
});
const memberVictim = seedUser('member-victim', { defaultGroupKey: GROUP_A });
const setVictim = seedUser('set-victim', { defaultGroupKey: GROUP_A });
const comboVictim = seedUser('combo-victim', { defaultGroupKey: GROUP_A });
const bVictim = seedUser('b-victim', { defaultGroupKey: GROUP_B });

function memberOf(user: SeedUser, groupAdmin = false): SeedMember {
  return {
    key: `m-${user.key}`,
    displayName: user.key,
    email: user.email,
    userKey: user.key,
    groupAdmin,
  };
}

function group(key: string, name: string, members: SeedMember[]): SeedGroup {
  return {
    key,
    owner: SPEC,
    name,
    members,
    categories: [{ key: `${key}-general`, name: 'General' }],
  };
}

const groupA = group(GROUP_A, 'User Rules – A', [
  memberOf(admin, true),
  memberOf(member),
  memberOf(own),
  memberOf(singleVictim),
  memberOf(profileVictim),
  memberOf(memberVictim),
  memberOf(setVictim),
  memberOf(comboVictim),
]);
const groupB = group(GROUP_B, 'User Rules – B', [
  memberOf(adminB, true),
  memberOf(admin),
  memberOf(bVictim),
]);
/** Never written; the target of the "set to a group" denial. */
const groupSecond = group(GROUP_SECOND, 'User Rules – Second', [
  memberOf(admin, true),
]);
/** Deactivated and archived (then reactivated) by the batch test. */
const groupBatch = group(GROUP_BATCH, 'User Rules – Batch', [
  memberOf(batchAdmin, true),
  memberOf(batchVictim),
]);

export const USER_RULES = {
  users: {
    admin,
    member,
    adminB,
    own,
    creator,
    batchAdmin,
    batchVictim,
    singleVictim,
    profileVictim,
    memberVictim,
    setVictim,
    comboVictim,
    bVictim,
  },
  groups: { groupA, groupB, groupSecond, groupBatch },
} as const;

export const USER_RULES_DATASET: SeedDataset = {
  name: 'user-rules',
  users: Object.values(USER_RULES.users),
  groups: Object.values(USER_RULES.groups),
};
