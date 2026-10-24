import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/infra/users-read-rules.spec.ts, which checks who may read
 * `users/{uid}` and the server-only verifiedEmails and paymentLookupLimits
 * collections (firestore.rules) through the client SDK; it never opens the
 * app. Nothing else reads this group or these users.
 *
 * - urr-reader: admin of "Users Read Rules – Main" (default). Tries to read
 *   urr-target's doc, to query users, and to reach its own index entry and
 *   payment-lookup counter. Its own docs are never written by a client; the
 *   spec writes its index entry and counter with the Admin SDK (the same
 *   shapes the functions write).
 * - urr-target: plain member of Main (default), with payment handles: the
 *   doc the reader and the app admin try to read. Never written.
 * - urr-fresh (no group): deletes its own users doc to read it before it
 *   exists (waitForServerCreatedUser's listen), and the spec restores it
 *   with the Admin SDK in the same test.
 */

const SPEC = 'spec:e2e/infra/users-read-rules.spec.ts' as const;
const GROUP_KEY = 'g-users-read-rules-main';
const PASSWORD = 'Seed-Pass-123!';

function seedUser(name: string, profile: SeedUser['profile'] = {}): SeedUser {
  const key = `urr-${name}`;
  return {
    key,
    uid: `u-${key}`,
    email: `${key}@pipsplit.test`,
    password: PASSWORD,
    profile,
  };
}

const users = {
  reader: seedUser('reader', { defaultGroupKey: GROUP_KEY }),
  target: seedUser('target', {
    defaultGroupKey: GROUP_KEY,
    venmoId: '@urr-target',
    paypalId: 'urr-target@pipsplit.test',
  }),
  fresh: seedUser('fresh'),
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

const group: SeedGroup = {
  key: GROUP_KEY,
  owner: SPEC,
  name: 'Users Read Rules – Main',
  members: [memberOf(users.reader, true), memberOf(users.target)],
  categories: [{ key: 'urr-general', name: 'General' }],
};

export const USERS_READ_RULES = { users, group } as const;

export const USERS_READ_RULES_DATASET: SeedDataset = {
  name: 'users-read-rules',
  users: Object.values(users),
  groups: [group],
};
