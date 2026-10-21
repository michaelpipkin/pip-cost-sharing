import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/auth/account-action.spec.ts: the verify-email screen
 * (/auth/account-action?mode=verifyEmail&oobCode=...). Every user is seeded
 * with an unverified address (`emailVerified: false`), and each test verifies
 * or sends mail for its own user, so there is one per test. Each is Vic, the
 * admin of their own group, which is their saved default, so signing in
 * writes nothing to the user doc.
 *
 * - action-signedout, "Action – Signed Out": verified while signed out (the
 *   Admin SDK issues the link); shows "Continue to Login".
 * - action-signedin, "Action – Signed In": signs in (an unverified user lands
 *   on Account), then opens the link; shows "Continue to Account".
 * - action-reuse, "Action – Reuse": opens the same link twice; the second
 *   visit is an error.
 * - action-resend, "Action – Resend": signs in, opens a bad link and uses the
 *   error state's "Resend Verification Email". Never verified.
 *
 * Unverified users sign in fine; the auth guard just holds them on Account.
 */

const SPEC = 'spec:e2e/auth/account-action.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

function makeUser(name: string): SeedUser {
  return {
    key: `action-${name}`,
    uid: `u-action-${name}`,
    email: `action-${name}@pipsplit.test`,
    password: PASSWORD,
    emailVerified: false,
    profile: { defaultGroupKey: `g-action-${name}` },
  };
}

const users = {
  signedOut: makeUser('signedout'),
  signedIn: makeUser('signedin'),
  reuse: makeUser('reuse'),
  resend: makeUser('resend'),
};

function makeGroup(key: string, title: string, user: SeedUser): SeedGroup {
  return {
    key: `g-action-${key}`,
    owner: SPEC,
    name: `Action – ${title}`,
    members: [
      {
        key: 'vic',
        displayName: 'Vic',
        email: user.email,
        userKey: user.key,
        groupAdmin: true,
      },
    ],
    categories: [{ key: 'general', name: 'General' }],
  };
}

export const ACCOUNT_ACTION = {
  users,
  groups: {
    signedOut: makeGroup('signedout', 'Signed Out', users.signedOut),
    signedIn: makeGroup('signedin', 'Signed In', users.signedIn),
    reuse: makeGroup('reuse', 'Reuse', users.reuse),
    resend: makeGroup('resend', 'Resend', users.resend),
  },
} as const;

export const ACCOUNT_ACTION_DATASET: SeedDataset = {
  name: 'account-action',
  users: Object.values(ACCOUNT_ACTION.users),
  groups: Object.values(ACCOUNT_ACTION.groups),
};
