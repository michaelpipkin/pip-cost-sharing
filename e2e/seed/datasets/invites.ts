import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/invites/invites.spec.ts. Everything lives in "Invites – Main",
 * the default and only group of both users; nobody switches groups.
 *
 * - invites-admin (Ada, group admin) sees the Invite column and sends the
 *   invites; invites-viewer (Vic, not an admin) never sees it.
 * - Unregistered members with a valid email, one per test that changes them:
 *   - invite-send: the send test invites them (envelope gone, mail queued);
 *   - invite-register: the registration test signs up with this address, which
 *     links the member. Seeded only as an invited member, NEVER as an Auth
 *     user: the registration journey is the one test in the suite that
 *     creates an Auth user at runtime;
 *   - invite-eligible: nobody changes them, so the eligibility test always
 *     has an envelope to anchor its "no envelope for the others" checks on.
 * - Members who must not be offered an invite (the eligibility test):
 *   - invite-cooldown: invited a moment before the seed run (24 h cooldown);
 *   - invite-inactive: has an email but is inactive;
 *   - invite-blank: no email;
 *   - Vic, and Ada: already linked to an account.
 *
 * Placeholder emails (@pipsplit.test) are never seeded as Auth users.
 */

const SPEC = 'spec:e2e/invites/invites.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

function makeUser(name: string): SeedUser {
  return {
    key: `invites-${name}`,
    uid: `u-invites-${name}`,
    email: `invites-${name}@pipsplit.test`,
    password: PASSWORD,
    profile: { defaultGroupKey: 'g-invites-main' },
  };
}

const users = {
  admin: makeUser('admin'),
  viewer: makeUser('viewer'),
};

/** Unregistered members; `key` is the member doc id (the button's id suffix). */
const invitees = {
  send: {
    key: 'invite-send',
    displayName: 'Sam Sender',
    email: 'invite-send@pipsplit.test',
  },
  register: {
    key: 'invite-register',
    displayName: 'Rae Register',
    email: 'invite-register@pipsplit.test',
  },
  eligible: {
    key: 'invite-eligible',
    displayName: 'Eli Eligible',
    email: 'invite-eligible@pipsplit.test',
  },
  cooldown: {
    key: 'invite-cooldown',
    displayName: 'Cora Cooldown',
    email: 'invite-cooldown@pipsplit.test',
  },
  inactive: {
    key: 'invite-inactive',
    displayName: 'Ida Inactive',
    email: 'invite-inactive@pipsplit.test',
  },
  blank: { key: 'invite-blank', displayName: 'Bo Blank', email: '' },
} as const;

const main: SeedGroup = {
  key: 'g-invites-main',
  owner: SPEC,
  name: 'Invites – Main',
  members: [
    {
      key: 'ada',
      displayName: 'Ada',
      email: users.admin.email,
      userKey: users.admin.key,
      groupAdmin: true,
    },
    {
      key: 'vic',
      displayName: 'Vic',
      email: users.viewer.email,
      userKey: users.viewer.key,
    },
    invitees.send,
    invitees.register,
    invitees.eligible,
    // Sent at the seed run, so well inside the 24 h cooldown.
    { ...invitees.cooldown, invite: { sentDaysAgo: 0, sendCount: 1 } },
    { ...invitees.inactive, active: false },
    invitees.blank,
  ],
  categories: [{ key: 'general', name: 'General' }],
};

export const INVITES = {
  users,
  group: main,
  invitees,
  /** Members who are linked to an account (Ada and Vic): never invitable. */
  linkedMemberKeys: ['ada', 'vic'],
} as const;

export const INVITES_DATASET: SeedDataset = {
  name: 'invites',
  users: Object.values(users),
  groups: [main],
};
