import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/auth/account-action.spec.ts: the email action screens
 * (/auth/account-action?mode=verifyEmail|verifyAndChangeEmail&oobCode=...).
 * Each test verifies, changes or sends mail for its own user, so there is one
 * per test. Each is Vic, the admin of their own group, which is their saved
 * default, so signing in writes nothing to the user doc.
 *
 * Verify-email users are seeded with an unverified address
 * (`emailVerified: false`, so their profile email is '' until verified):
 * - action-signedout, "Action – Signed Out": verified while signed out (the
 *   Admin SDK issues the link); shows "Continue to Login".
 * - action-signedin, "Action – Signed In": signs in (an unverified user lands
 *   on Account), then opens the link; shows "Continue to Account".
 * - action-reuse, "Action – Reuse": opens the same link twice; the second
 *   visit is an error.
 * - action-resend, "Action – Resend": signs in, opens a bad link and uses the
 *   error state's "Resend Verification Email". Never verified.
 *
 * Change-email users are verified; each test moves its user to a new address
 * that is never seeded (CHANGE_EMAILS), so each is one-shot per seeding:
 * - action-changein, "Action – Change In": signed in when the change link is
 *   opened; the app writes the new address to the profile at once.
 * - action-changeout, "Action – Change Out": opens the link signed out, then
 *   signs in with the new address (the session sync writes it).
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
  changeIn: { ...makeUser('changein'), emailVerified: true },
  changeOut: { ...makeUser('changeout'), emailVerified: true },
};

/** The addresses the change-email tests move their users to (never seeded). */
export const CHANGE_EMAILS = {
  changeIn: 'action-changein-new@pipsplit.test',
  changeOut: 'action-changeout-new@pipsplit.test',
} as const;

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
    changeIn: makeGroup('changein', 'Change In', users.changeIn),
    changeOut: makeGroup('changeout', 'Change Out', users.changeOut),
  },
} as const;

export const ACCOUNT_ACTION_DATASET: SeedDataset = {
  name: 'account-action',
  users: Object.values(ACCOUNT_ACTION.users),
  groups: Object.values(ACCOUNT_ACTION.groups),
};
