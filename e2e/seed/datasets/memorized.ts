import type {
  SeedCategory,
  SeedDataset,
  SeedGroup,
  SeedMember,
  SeedMemorized,
  SeedUser,
} from '../types';

/**
 * Owned by e2e/memorized/memorized.spec.ts. One user per group, and each
 * user's only (and default) group is their group, so signing in writes
 * nothing and no test switches groups. Every group has the categories
 * General and Travel (two, so the category select is visible) and does not
 * auto-add members, so the forms start with no splits. Every user is Ari,
 * the group's admin.
 *
 * - memorized-browse, "Memorized – Browse" (read-only): Ari, Blake, Cody and
 *   two memorized docs that differ in description, payer and category, for
 *   the list, search and expanded splits.
 * - memorized-use, "Memorized – Use": Ari, Blake, Cody and one memorized doc
 *   (paid by Blake, Travel, $120 split 50 / 30 / 20 percent = 60 / 36 / 24)
 *   used to create an expense. Payer, category and split method differ from
 *   a blank Add Expense (Ari, General, amount), so a prefill can't be
 *   mistaken for the defaults.
 * - memorized-create, "Memorized – Create": Ari, Blake, Cody, none memorized;
 *   the create test memorizes one under a unique description.
 * - memorized-edit, "Memorized – Edit": Ari, Blake and one memorized doc
 *   ($40: Ari 20 / Blake 20), changed by the edit test.
 * - memorized-delete, "Memorized – Delete": Ari, Blake and one memorized
 *   doc, deleted by its test.
 * - memorized-empty, "Memorized – Empty" (read-only): Ari, Blake, none
 *   memorized, for the empty state.
 */

const SPEC = 'spec:e2e/memorized/memorized.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

function makeUser(name: string): SeedUser {
  return {
    key: `memorized-${name}`,
    uid: `u-memorized-${name}`,
    email: `memorized-${name}@pipsplit.test`,
    password: PASSWORD,
    profile: { defaultGroupKey: `g-memorized-${name}` },
  };
}

const users = {
  browse: makeUser('browse'),
  use: makeUser('use'),
  create: makeUser('create'),
  edit: makeUser('edit'),
  delete: makeUser('delete'),
  empty: makeUser('empty'),
};

function ari(user: SeedUser): SeedMember {
  return {
    key: 'ari',
    displayName: 'Ari',
    email: user.email,
    userKey: user.key,
    groupAdmin: true,
  };
}

const blake: SeedMember = { key: 'blake', displayName: 'Blake', email: '' };
const cody: SeedMember = { key: 'cody', displayName: 'Cody', email: '' };

const categories: SeedCategory[] = [
  { key: 'general', name: 'General' },
  { key: 'travel', name: 'Travel' },
];

function makeGroup(
  name: keyof typeof users,
  title: string,
  members: SeedMember[],
  memorized?: SeedMemorized[]
): SeedGroup {
  return {
    key: `g-memorized-${name}`,
    owner: SPEC,
    name: `Memorized – ${title}`,
    members: [ari(users[name]), ...members],
    categories,
    memorized,
  };
}

const PIZZA: SeedMemorized = {
  key: 'm-browse-pizza',
  description: 'Browse – Pizza night',
  categoryKey: 'general',
  paidByKey: 'ari',
  totalAmount: 60,
  splitMethod: 'amount',
  splits: [
    { owedByKey: 'ari', assignedAmount: 30 },
    { owedByKey: 'blake', assignedAmount: 30 },
  ],
};

const FLIGHTS: SeedMemorized = {
  key: 'm-browse-flights',
  description: 'Browse – Flights',
  categoryKey: 'travel',
  paidByKey: 'blake',
  totalAmount: 200,
  splitMethod: 'amount',
  splits: [
    { owedByKey: 'ari', assignedAmount: 120 },
    { owedByKey: 'blake', assignedAmount: 80 },
  ],
};

const USE: SeedMemorized = {
  key: 'm-use-cabin',
  description: 'Use – Cabin supplies',
  categoryKey: 'travel',
  paidByKey: 'blake',
  totalAmount: 120,
  splitMethod: 'percentage',
  splits: [
    { owedByKey: 'ari', percentage: 50 },
    { owedByKey: 'blake', percentage: 30 },
    { owedByKey: 'cody', percentage: 20 },
  ],
};

const EDIT: SeedMemorized = {
  key: 'm-edit-rent',
  description: 'Edit – Monthly rent',
  categoryKey: 'general',
  paidByKey: 'ari',
  totalAmount: 40,
  splitMethod: 'amount',
  splits: [
    { owedByKey: 'ari', assignedAmount: 20 },
    { owedByKey: 'blake', assignedAmount: 20 },
  ],
};

const DELETE: SeedMemorized = {
  key: 'm-delete-gym',
  description: 'Delete – Gym pass',
  categoryKey: 'general',
  paidByKey: 'ari',
  totalAmount: 30,
  splitMethod: 'amount',
  splits: [
    { owedByKey: 'ari', assignedAmount: 15 },
    { owedByKey: 'blake', assignedAmount: 15 },
  ],
};

export const MEMORIZED = {
  users,
  groups: {
    browse: makeGroup('browse', 'Browse', [blake, cody], [PIZZA, FLIGHTS]),
    use: makeGroup('use', 'Use', [blake, cody], [USE]),
    create: makeGroup('create', 'Create', [blake, cody]),
    edit: makeGroup('edit', 'Edit', [blake], [EDIT]),
    delete: makeGroup('delete', 'Delete', [blake], [DELETE]),
    empty: makeGroup('empty', 'Empty', [blake]),
  },
  /** The seeded memorized docs, by the group that holds them. */
  memorized: { pizza: PIZZA, flights: FLIGHTS, use: USE, edit: EDIT, delete: DELETE },
} as const;

export const MEMORIZED_DATASET: SeedDataset = {
  name: 'memorized',
  users: Object.values(MEMORIZED.users),
  groups: Object.values(MEMORIZED.groups),
};
