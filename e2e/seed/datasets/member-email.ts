import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/members/member-email.spec.ts (Plan 4 B19: verified group
 * emails).
 *
 * - member-email-self (Mae) in "Member Email – Main", her only and default
 *   group, as a plain member (the group's admin is Odile, a placeholder who
 *   never signs in). The journey test changes Mae's own group email to a new
 *   address unique to the run (never seeded, so the confirmation mail goes
 *   only to an address this spec owns), confirms it through the mailed link
 *   and checks the row. It first puts Mae's row back to the seeded address
 *   (Admin SDK), so it repeats, up to the callable's limit of 5 mailed
 *   requests per uid per day within one seeding.
 *
 * - member-email-cooldown (Cleo) in "Member Email – Cooldown", her only and
 *   default group (admin: Otto, a placeholder). The cooldown test asks
 *   twice for the same new address, unique to the run: the first request
 *   mails a link, the second is refused by the per-recipient cooldown (one
 *   confirmation per address per hour). Her own user and group because each
 *   request replaces her pending link, which would break the journey test's
 *   link if they shared Mae. Repeats up to 5 times per seeding (the per-uid
 *   limit; the refused request is not counted).
 *
 * The admin-side check (a linked member's email is locked) reads the shared
 * group as SHARED.users.alice and writes nothing.
 */

const SPEC = 'spec:e2e/members/member-email.spec.ts' as const;
const GROUP_KEY = 'g-member-email-main';
const COOLDOWN_GROUP_KEY = 'g-member-email-cooldown';

const self: SeedUser = {
  key: 'member-email-self',
  uid: 'u-member-email-self',
  email: 'member-email-self@pipsplit.test',
  password: 'Seed-Pass-123!',
  profile: { defaultGroupKey: GROUP_KEY },
};

const selfMember = {
  key: 'mae',
  displayName: 'Mae',
  email: self.email,
  userKey: self.key,
} as const;

const main: SeedGroup = {
  key: GROUP_KEY,
  owner: SPEC,
  name: 'Member Email – Main',
  members: [
    { key: 'odile', displayName: 'Odile', email: '', groupAdmin: true },
    selfMember,
  ],
  categories: [{ key: 'member-email-general', name: 'General' }],
};

const cooldownUser: SeedUser = {
  key: 'member-email-cooldown',
  uid: 'u-member-email-cooldown',
  email: 'member-email-cooldown@pipsplit.test',
  password: 'Seed-Pass-123!',
  profile: { defaultGroupKey: COOLDOWN_GROUP_KEY },
};

const cooldownMember = {
  key: 'cleo',
  displayName: 'Cleo',
  email: cooldownUser.email,
  userKey: cooldownUser.key,
} as const;

const cooldown: SeedGroup = {
  key: COOLDOWN_GROUP_KEY,
  owner: SPEC,
  name: 'Member Email – Cooldown',
  members: [
    { key: 'otto', displayName: 'Otto', email: '', groupAdmin: true },
    cooldownMember,
  ],
  categories: [{ key: 'member-email-cooldown-general', name: 'General' }],
};

export const MEMBER_EMAIL = {
  users: { self, cooldown: cooldownUser },
  groups: { main, cooldown },
  selfMember,
  cooldownMember,
} as const;

export const MEMBER_EMAIL_DATASET: SeedDataset = {
  name: 'member-email',
  users: [self, cooldownUser],
  groups: [main, cooldown],
};
