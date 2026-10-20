import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/auth/auth-authenticated.spec.ts. The user belongs to one group
 * (and has it as default) so sign-in lands on a normal authenticated shell.
 * The spec only signs in and out; it never mutates this data.
 */

const SPEC = 'spec:e2e/auth/auth-authenticated.spec.ts' as const;

const authUser: SeedUser = {
  key: 'auth-user',
  uid: 'u-auth-user',
  email: 'auth-user@pipsplit.test',
  password: 'Seed-Pass-123!',
  profile: { defaultGroupKey: 'g-auth-home' },
};

const authHome: SeedGroup = {
  key: 'g-auth-home',
  owner: SPEC,
  name: 'Auth – Home',
  members: [
    {
      key: 'auth-user',
      displayName: 'Auth User',
      email: authUser.email,
      userKey: 'auth-user',
      groupAdmin: true,
    },
  ],
  categories: [{ key: 'general', name: 'General' }],
};

export const AUTH = {
  users: { authUser },
  groups: { authHome },
} as const;

export const AUTH_DATASET: SeedDataset = {
  name: 'auth',
  users: Object.values(AUTH.users),
  groups: [authHome],
};
