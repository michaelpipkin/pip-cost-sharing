import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/infra/member-rules.spec.ts, which checks who may write
 * `groups/{gid}/members/{mid}` (firestore.rules memberSelfUpdateValid)
 * through the client SDK; it never opens the app. Nothing else reads this
 * group or these users.
 *
 * Everyone is in "Member Rules – Main", their only and default group (so no
 * sign-in would change a users doc; the spec never opens the app anyway).
 * One member per test, so parallel tests never write the same doc. Every
 * test ends with its member back in the seeded state (each starts by
 * resetting it with the Admin SDK), so all of them repeat fine:
 * - member-rules-admin: the group admin. Promotes and demotes "Promotee",
 *   and recreates "Deleter" after the self-delete test.
 * - member-rules-promoter: a plain member who tries to make themselves
 *   admin and to change their own userRef.
 * - member-rules-promotee: a plain member the admin promotes.
 * - member-rules-leaver: leaves (the update leaveGroup makes when the
 *   member has splits) and rejoins.
 * - member-rules-deleter: leaves with no splits (deletes their own doc).
 * - member-rules-emailer: changes their member email the way Account >
 *   Profile's updateAllMemberEmails does.
 * - member-rules-deactivated: seeded inactive, as an admin deactivates a
 *   member (not leftGroup); tries to reactivate themselves.
 * - member-rules-left: seeded as having left (leftGroup); tries to rejoin as
 *   an admin, then rejoins and leaves again.
 */

const SPEC = 'spec:e2e/infra/member-rules.spec.ts' as const;
const GROUP_KEY = 'g-member-rules-main';
const PASSWORD = 'Seed-Pass-123!';

function seedUser(name: string): SeedUser {
  const key = `member-rules-${name}`;
  return {
    key,
    uid: `u-${key}`,
    email: `${key}@pipsplit.test`,
    password: PASSWORD,
    profile: { defaultGroupKey: GROUP_KEY },
  };
}

const admin = seedUser('admin');
const promoter = seedUser('promoter');
const promotee = seedUser('promotee');
const leaver = seedUser('leaver');
const deleter = seedUser('deleter');
const emailer = seedUser('emailer');
const deactivated = seedUser('deactivated');
const left = seedUser('left');

function memberOf(
  user: SeedUser,
  fields: Partial<Pick<SeedMember, 'active' | 'groupAdmin' | 'leftGroup'>> = {}
): SeedMember {
  return {
    key: `m-${user.key}`,
    displayName: user.key,
    email: user.email,
    userKey: user.key,
    ...fields,
  };
}

const members = {
  admin: memberOf(admin, { groupAdmin: true }),
  promoter: memberOf(promoter),
  promotee: memberOf(promotee),
  leaver: memberOf(leaver),
  deleter: memberOf(deleter),
  emailer: memberOf(emailer),
  deactivated: memberOf(deactivated, { active: false }),
  left: memberOf(left, { active: false, leftGroup: true }),
} as const;

const group: SeedGroup = {
  key: GROUP_KEY,
  owner: SPEC,
  name: 'Member Rules – Main',
  members: Object.values(members),
  categories: [{ key: 'member-rules-general', name: 'General' }],
};

export const MEMBER_RULES = {
  users: {
    admin,
    promoter,
    promotee,
    leaver,
    deleter,
    emailer,
    deactivated,
    left,
  },
  members,
  group,
} as const;

export const MEMBER_RULES_DATASET: SeedDataset = {
  name: 'member-rules',
  users: Object.values(MEMBER_RULES.users),
  groups: [group],
};
