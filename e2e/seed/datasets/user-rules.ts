import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/infra/user-rules.spec.ts, which checks who may write
 * `users/{uid}` (firestore.rules) through the client SDK; it never opens the
 * app. Nothing else reads these groups or users.
 *
 * Attackers (their own docs are never written):
 * - user-rules-admin: admin of "User Rules – A" (default).
 * - user-rules-member: plain member of "User Rules – A".
 *
 * One target user per test, so parallel tests never write the same doc. Each
 * test that changes a target's defaultGroupRef first has the target reset it
 * (an own write), so every test repeats fine:
 * - user-rules-own: updates their own handles, emailOptOut and default.
 * - user-rules-creator (no group): deletes and recreates their own doc.
 * - user-rules-batch-admin / user-rules-batch-victim: admin and plain member
 *   of "User Rules – Batch", both defaulting to it. The batch test tries to
 *   clear the victim's default along with a deactivate or archive (denied),
 *   then archives that group (it reactivates it first). The archive fires
 *   clearDefaultsOnGroupDeactivate, which clears both defaults some seconds
 *   later; nothing reads them afterwards. (So a --repeat-each run of that
 *   test can race the previous run's trigger.)
 * - user-rules-single-victim, -profile-victim: plain members of "User Rules
 *   – A", defaulting to it.
 */

const SPEC = 'spec:e2e/infra/user-rules.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const GROUP_A = 'g-user-rules-a';
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
]);
/** Archived (after being reactivated) by the batch test. */
const groupBatch = group(GROUP_BATCH, 'User Rules – Batch', [
  memberOf(batchAdmin, true),
  memberOf(batchVictim),
]);

export const USER_RULES = {
  users: {
    admin,
    member,
    own,
    creator,
    batchAdmin,
    batchVictim,
    singleVictim,
    profileVictim,
  },
  groups: { groupA, groupBatch },
} as const;

export const USER_RULES_DATASET: SeedDataset = {
  name: 'user-rules',
  users: Object.values(USER_RULES.users),
  groups: Object.values(USER_RULES.groups),
};
