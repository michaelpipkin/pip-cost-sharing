import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/members/member-linking.spec.ts: the server links an invited
 * member row to the account that owns its address (the verified-address
 * index), when an admin adds the row or edits its email.
 *
 * - ml-admin (Ada, group admin) in "Member Linking – Main", the only and
 *   default group. Every test signs in as Ada and works on rows of its own.
 * - The linked accounts below never sign in. Each is a verified Auth user, so
 *   the sign-up trigger indexes its login address; none is a member of Main
 *   unless stated. Each test claims its account's address by adding or
 *   editing a row with it, so these tests are one-shot per seeding (a second
 *   run would be refused as a duplicate address, or find the row locked).
 *   - ml-login: added by its login address.
 *   - ml-secondary: added by a second address the spec indexes at run time
 *     (a confirmed group email, in production).
 *   - ml-editee: the address an unlinked row's email is edited to; the row
 *     "Link By Edit" starts with no email.
 *   - ml-twin: already linked in Main as "Twin"; the test adds a second row
 *     for the same person under another address of theirs, which must stay
 *     unlinked (one row per account per group).
 *   - ml-control: added in the twin test as a positive control, so the
 *     "stays unlinked" check is read only after the trigger has run.
 */

const SPEC = 'spec:e2e/members/member-linking.spec.ts' as const;
const GROUP_KEY = 'g-member-linking-main';
const PASSWORD = 'Seed-Pass-123!';

function seedUser(name: string, profile: SeedUser['profile'] = {}): SeedUser {
  const key = `ml-${name}`;
  return {
    key,
    uid: `u-${key}`,
    email: `${key}@pipsplit.test`,
    password: PASSWORD,
    profile,
  };
}

const users = {
  admin: seedUser('admin', { defaultGroupKey: GROUP_KEY }),
  login: seedUser('login'),
  secondary: seedUser('secondary'),
  editee: seedUser('editee'),
  twin: seedUser('twin', { defaultGroupKey: GROUP_KEY }),
  control: seedUser('control'),
} as const;

/** The unlinked, email-less row the edit test gives an owned address. */
const editRow = { key: 'link-by-edit', displayName: 'Link By Edit', email: '' };

/** The row already linked to ml-twin. */
const twinRow = {
  key: 'twin',
  displayName: 'Twin',
  email: users.twin.email,
  userKey: users.twin.key,
};

const main: SeedGroup = {
  key: GROUP_KEY,
  owner: SPEC,
  name: 'Member Linking – Main',
  members: [
    {
      key: 'ada',
      displayName: 'Ada',
      email: users.admin.email,
      userKey: users.admin.key,
      groupAdmin: true,
    },
    editRow,
    twinRow,
  ],
  categories: [{ key: 'general', name: 'General' }],
};

export const MEMBER_LINKING = {
  users,
  group: main,
  editRow,
  twinRow,
} as const;

export const MEMBER_LINKING_DATASET: SeedDataset = {
  name: 'member-linking',
  users: Object.values(users),
  groups: [main],
};
