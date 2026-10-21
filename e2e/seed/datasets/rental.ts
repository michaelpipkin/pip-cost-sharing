import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedMember, SeedUser } from '../types';

/**
 * Owned by e2e/rental/rental.spec.ts. One user per group, and each user's
 * only (and default) group is their group, so signing in writes nothing and
 * no test switches groups.
 *
 * - rental-create, only in "Rental – Create": members Ari (the user, admin),
 *   Blake, Cody; categories General and Travel (the rental hand-off picks
 *   Travel by name). The create test saves a rental under a unique
 *   description; the "block Continue" test only drives the wizard.
 * - rental-rooms, only in "Rental – Rooms": members Ari (the user, admin)
 *   and Blake; same categories. One test saves a rental with a room rate.
 * - rental-edit, only in "Rental – Edit": members Ari (the user, admin),
 *   Blake, Cody; categories General and Travel. Two seeded rental expenses
 *   (2 nights, all three present both nights, $300, shares 2 / 2 / 2, so
 *   $100 each), one per test that opens the edit dialog, because the edit
 *   test saves its expense and the cancel test must see an untouched one:
 *     - "Rental – Edit stay": changed by the edit test.
 *     - "Rental – Cancel stay": never saved.
 */

const SPEC = 'spec:e2e/rental/rental.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const createUser: SeedUser = {
  key: 'rental-create',
  uid: 'u-rental-create',
  email: 'rental-create@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-rental-create' },
};

const roomsUser: SeedUser = {
  key: 'rental-rooms',
  uid: 'u-rental-rooms',
  email: 'rental-rooms@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-rental-rooms' },
};

const editUser: SeedUser = {
  key: 'rental-edit',
  uid: 'u-rental-edit',
  email: 'rental-edit@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-rental-edit' },
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

const categories = [
  { key: 'general', name: 'General' },
  { key: 'travel', name: 'Travel' },
];

const create: SeedGroup = {
  key: 'g-rental-create',
  owner: SPEC,
  name: 'Rental – Create',
  members: [ari(createUser), blake, cody],
  categories,
};

const rooms: SeedGroup = {
  key: 'g-rental-rooms',
  owner: SPEC,
  name: 'Rental – Rooms',
  members: [ari(roomsUser), blake],
  categories,
};

function seededStay(key: string, description: string, daysAgo: number) {
  return {
    key,
    date: seedDaysAgo(daysAgo),
    description,
    categoryKey: 'travel',
    paidByKey: 'ari',
    totalAmount: 300,
    splitMethod: 'shares' as const,
    splits: [
      { owedByKey: 'ari', shares: 2 },
      { owedByKey: 'blake', shares: 2 },
      { owedByKey: 'cody', shares: 2 },
    ],
    rental: {
      nightCount: 2,
      stays: [
        { memberKey: 'ari', nights: [0, 1] },
        { memberKey: 'blake', nights: [0, 1] },
        { memberKey: 'cody', nights: [0, 1] },
      ],
    },
  };
}

const EDIT_STAY_DESCRIPTION = 'Rental – Edit stay';
const CANCEL_STAY_DESCRIPTION = 'Rental – Cancel stay';

const edit: SeedGroup = {
  key: 'g-rental-edit',
  owner: SPEC,
  name: 'Rental – Edit',
  members: [ari(editUser), blake, cody],
  categories,
  expenses: [
    seededStay('e-rental-edit-stay', EDIT_STAY_DESCRIPTION, 3),
    seededStay('e-rental-cancel-stay', CANCEL_STAY_DESCRIPTION, 4),
  ],
};

export const RENTAL = {
  users: { create: createUser, rooms: roomsUser, edit: editUser },
  groups: { create, rooms, edit },
  /** Seeded rental expenses in "Rental – Edit". */
  descriptions: { edit: EDIT_STAY_DESCRIPTION, cancel: CANCEL_STAY_DESCRIPTION },
} as const;

export const RENTAL_DATASET: SeedDataset = {
  name: 'rental',
  users: Object.values(RENTAL.users),
  groups: Object.values(RENTAL.groups),
};
