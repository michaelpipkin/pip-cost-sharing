import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/infra/member-email-rules.spec.ts, which checks the Firestore
 * rules that keep a linked member's `email` an address the linked user has
 * proven they own (Plan 4 B19): who may set or change `userRef`, and who may
 * change `email` on a linked or unlinked member doc. It never opens the app.
 * Nothing else reads this group or these users.
 *
 * Everyone below is in "Member Email Rules – Main" (their only and default
 * group) unless noted. Each test works on its own member docs and starts by
 * resetting them with the Admin SDK, so every test repeats fine. Nothing is
 * deleted (Ruling R21); what the tests add at runtime is listed here and no
 * test counts members, groups or memberships:
 * - mer-admin (group admin): makes every admin write. Each run of the create
 *   test adds new unlinked members with unique ids and addresses nobody owns
 *   to Main, and each run of the addGroup test creates three groups of
 *   mer-admin's own with unique names ("Member Email Rules – Created <id>"),
 *   so mer-admin gains memberships; its default group stays Main.
 * - mer-self: a plain linked member who tries to change their own userRef
 *   and to reach the email-change token and rate-limit docs.
 * - mer-target: a plain linked member whose email the admin, and the member
 *   themself, try to change; also makes edit-member's self-save of
 *   displayName.
 * - mer-unlinkee: a plain linked member the admin unlinks (userRef X to
 *   null) and tries to relink to someone else (X to Y).
 * - mer-unverified (Auth address unverified): a linked member whose token
 *   says email_verified false, so even their own address is refused.
 * - mer-linkable (their default group is their own "Member Email Rules –
 *   Linkable Home"): a registered user the admin tries to link "Unlinked
 *   Link" to, and to move mer-unlinkee's row to. Every such write is
 *   denied, so it never joins Main.
 * - mer-lagging (no seeded group): the addGroup test sets its users doc's
 *   email (Admin SDK) to an older address than its Auth one, then creates
 *   three groups of its own ("Member Email Rules – Created <id>"; the denied
 *   try leaves its group without a member row). Nothing else reads it.
 * - mer-victim (no group): a registered user the I2 attack tries to link to
 *   a member doc, with an attacker-chosen email or its own. Every such write
 *   is denied, so it never gains a membership.
 * Unlinked placeholders: "Unlinked Edit" (the admin changes its email) and
 * "Unlinked Link" (the admin tries to link it to mer-linkable).
 */

const SPEC = 'spec:e2e/infra/member-email-rules.spec.ts' as const;
const GROUP_KEY = 'g-member-email-rules-main';
const LINKABLE_HOME_KEY = 'g-member-email-rules-linkable-home';
const PASSWORD = 'Seed-Pass-123!';

function seedUser(
  name: string,
  options: { defaultGroupKey?: string; emailVerified?: boolean } = {}
): SeedUser {
  const key = `mer-${name}`;
  return {
    key,
    uid: `u-${key}`,
    email: `${key}@pipsplit.test`,
    password: PASSWORD,
    ...(options.emailVerified === false ? { emailVerified: false } : {}),
    profile:
      options.defaultGroupKey === undefined
        ? {}
        : { defaultGroupKey: options.defaultGroupKey },
  };
}

const users = {
  admin: seedUser('admin', { defaultGroupKey: GROUP_KEY }),
  self: seedUser('self', { defaultGroupKey: GROUP_KEY }),
  target: seedUser('target', { defaultGroupKey: GROUP_KEY }),
  unlinkee: seedUser('unlinkee', { defaultGroupKey: GROUP_KEY }),
  unverified: seedUser('unverified', {
    defaultGroupKey: GROUP_KEY,
    emailVerified: false,
  }),
  linkable: seedUser('linkable', { defaultGroupKey: LINKABLE_HOME_KEY }),
  lagging: seedUser('lagging'),
  victim: seedUser('victim'),
} as const;

function memberOf(user: SeedUser, groupAdmin = false): SeedMember {
  return {
    key: `m-${user.key}`,
    displayName: user.key,
    email: user.email,
    userKey: user.key,
    groupAdmin,
  };
}

const members = {
  admin: memberOf(users.admin, true),
  self: memberOf(users.self),
  target: memberOf(users.target),
  unlinkee: memberOf(users.unlinkee),
  unverified: memberOf(users.unverified),
  unlinkedEdit: {
    key: 'm-mer-unlinked-edit',
    displayName: 'Unlinked Edit',
    email: 'mer-unlinked-edit@pipsplit.test',
  },
  unlinkedLink: {
    key: 'm-mer-unlinked-link',
    displayName: 'Unlinked Link',
    email: '',
  },
} as const satisfies Record<string, SeedMember>;

const group: SeedGroup = {
  key: GROUP_KEY,
  owner: SPEC,
  name: 'Member Email Rules – Main',
  members: Object.values(members),
  categories: [{ key: 'mer-general', name: 'General' }],
};

const linkableHome: SeedGroup = {
  key: LINKABLE_HOME_KEY,
  owner: SPEC,
  name: 'Member Email Rules – Linkable Home',
  members: [memberOf(users.linkable, true)],
  categories: [{ key: 'mer-linkable-general', name: 'General' }],
};

export const MEMBER_EMAIL_RULES = {
  users,
  members,
  group,
} as const;

export const MEMBER_EMAIL_RULES_DATASET: SeedDataset = {
  name: 'member-email-rules',
  users: Object.values(users),
  groups: [group, linkableHome],
};
