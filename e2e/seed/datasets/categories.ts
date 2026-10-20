import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/categories/categories.spec.ts. One group, "Categories – Main",
 * with two members and two users:
 *
 * - categories-admin (Ari, group admin) is the user of the admin tests. Each
 *   test works on its own category, so they share the group and the user
 *   (nobody switches groups or changes user-level state):
 *   - "Rename Me": renamed by the rename test;
 *   - "Deactivate Me": deactivated by the deactivate test;
 *   - "Delete Me" (unused): deleted by the delete test;
 *   - General: in use by one seeded expense, so deleting it must be refused.
 *     Nothing renames or deactivates it. The add test creates a category
 *     under a unique name.
 * - categories-viewer (Vic, not an admin) only reads: the read-only test.
 *
 * Both users have the group as their saved default, so signing in writes
 * nothing to the user doc.
 */

const SPEC = 'spec:e2e/categories/categories.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';
const GROUP_KEY = 'g-categories-main';

function makeUser(name: string): SeedUser {
  return {
    key: `categories-${name}`,
    uid: `u-categories-${name}`,
    email: `categories-${name}@pipsplit.test`,
    password: PASSWORD,
    profile: { defaultGroupKey: GROUP_KEY },
  };
}

const users = {
  admin: makeUser('admin'),
  viewer: makeUser('viewer'),
};

/** The seeded categories; `key` is also the row's test id suffix. */
const categories = {
  general: { key: 'cat-general', name: 'General' },
  rename: { key: 'cat-rename-me', name: 'Rename Me' },
  deactivate: { key: 'cat-deactivate-me', name: 'Deactivate Me' },
  delete: { key: 'cat-delete-me', name: 'Delete Me' },
} as const;

const group: SeedGroup = {
  key: GROUP_KEY,
  owner: SPEC,
  name: 'Categories – Main',
  members: [
    {
      key: 'ari',
      displayName: 'Ari',
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
  ],
  categories: Object.values(categories),
  expenses: [
    {
      key: 'e-categories-general',
      date: seedDaysAgo(2),
      description: 'Categories – General expense',
      categoryKey: categories.general.key,
      paidByKey: 'ari',
      totalAmount: 20,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ari', assignedAmount: 10 },
        { owedByKey: 'vic', assignedAmount: 10 },
      ],
    },
  ],
};

export const CATEGORIES = { users, group, categories } as const;

export const CATEGORIES_DATASET: SeedDataset = {
  name: 'categories',
  users: Object.values(users),
  groups: [group],
};
