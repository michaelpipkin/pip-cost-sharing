import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/account/account.spec.ts. One user per mutating test, because
 * every one of these tests changes one-way user state (payment IDs, the
 * email opt-out, the receipt policy, the password, the saved default group)
 * or the user's group membership. Each user is Ari, the admin of their own
 * group, and that group is their saved default, so signing in writes nothing
 * to the user doc except what a test is about.
 *
 * - account-payments, "Account – Payments": saves the four payment IDs. The
 *   user is seeded with none.
 * - account-notify, "Account – Notify": turns email notifications off and on.
 * - account-legal, "Account – Legal": accepts the receipt policy (seeded
 *   without it).
 * - account-password, "Account – Password": changes the password to
 *   NEW_PASSWORD. Nobody else signs in as them.
 * - account-prefs, "Account – Prefs A" (default) and "Account – Prefs B":
 *   saves B as the default group.
 * - account-rejoin, "Account – Rejoin Home" (default) and "Account – Left",
 *   where the user's member left the group (inactive, leftGroup). The
 *   group's admin is the placeholder user account-leftadmin, who never signs
 *   in. The rejoin test brings the member back.
 */

const SPEC = 'spec:e2e/account/account.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

/** The password the change-password test sets on account-password. */
export const NEW_PASSWORD = 'Changed-Pass-456!';

function makeUser(name: string, defaultGroupKey: string): SeedUser {
  return {
    key: `account-${name}`,
    uid: `u-account-${name}`,
    email: `account-${name}@pipsplit.test`,
    password: PASSWORD,
    profile: { defaultGroupKey },
  };
}

const users = {
  payments: makeUser('payments', 'g-account-payments'),
  notify: makeUser('notify', 'g-account-notify'),
  legal: makeUser('legal', 'g-account-legal'),
  password: makeUser('password', 'g-account-password'),
  prefs: makeUser('prefs', 'g-account-prefs-a'),
  rejoin: makeUser('rejoin', 'g-account-rejoin-home'),
  leftAdmin: makeUser('leftadmin', 'g-account-left'),
};

function ari(user: SeedUser, extra: Partial<SeedMember> = {}): SeedMember {
  return {
    key: 'ari',
    displayName: 'Ari',
    email: user.email,
    userKey: user.key,
    groupAdmin: true,
    ...extra,
  };
}

function makeGroup(
  key: string,
  title: string,
  members: SeedMember[]
): SeedGroup {
  return {
    key: `g-account-${key}`,
    owner: SPEC,
    name: `Account – ${title}`,
    members,
    categories: [{ key: 'general', name: 'General' }],
  };
}

export const ACCOUNT = {
  users,
  groups: {
    payments: makeGroup('payments', 'Payments', [ari(users.payments)]),
    notify: makeGroup('notify', 'Notify', [ari(users.notify)]),
    legal: makeGroup('legal', 'Legal', [ari(users.legal)]),
    password: makeGroup('password', 'Password', [ari(users.password)]),
    prefsA: makeGroup('prefs-a', 'Prefs A', [ari(users.prefs)]),
    prefsB: makeGroup('prefs-b', 'Prefs B', [ari(users.prefs)]),
    rejoinHome: makeGroup('rejoin-home', 'Rejoin Home', [ari(users.rejoin)]),
    left: makeGroup('left', 'Left', [
      ari(users.leftAdmin, { key: 'dana', displayName: 'Dana' }),
      ari(users.rejoin, { groupAdmin: false, active: false, leftGroup: true }),
    ]),
  },
} as const;

export const ACCOUNT_DATASET: SeedDataset = {
  name: 'account',
  users: Object.values(ACCOUNT.users),
  groups: Object.values(ACCOUNT.groups),
};
