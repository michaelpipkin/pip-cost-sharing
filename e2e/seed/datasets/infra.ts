import { seedDaysAgo } from '../dates';
import type { SeedAppError, SeedDataset, SeedGroup, SeedMail, SeedUser } from '../types';

/**
 * Owned by e2e/infra/seed.spec.ts. A small fixture that exercises every seeder
 * feature the feature datasets rely on, so the seed-health spec can check the
 * writes without waiting for those datasets: read-only, nobody signs in.
 *
 * - infra-user, only in "Infra – Seed Coverage" (default group). Members: Ivy
 *   (the user, admin), Jo (placeholder), Kit (left the group: inactive,
 *   leftGroup) and Lee (placeholder with an invite sent 2 days ago, 3 times).
 * - x-rental: shares expense with a 3-night rental (Ivy and Jo all three
 *   nights, Jo in the "loft" room, Lee nights 1 and 2).
 * - x-receipt: amount expense with a stored receipt (receipt.png).
 * - m-lunch: memorized amount expense.
 * - Mail docs (always written with a delivery block, so the trigger skips
 *   them) and one app error, found by their own keys. Mail goes to the
 *   spec's own infra-user address; nothing is ever sent.
 */

const SPEC = 'spec:e2e/infra/seed.spec.ts' as const;

const infraUser: SeedUser = {
  key: 'infra-user',
  uid: 'u-infra-user',
  email: 'infra-user@pipsplit.test',
  password: 'Seed-Pass-123!',
  profile: { defaultGroupKey: 'g-infra-seed' },
};

const group: SeedGroup = {
  key: 'g-infra-seed',
  owner: SPEC,
  name: 'Infra – Seed Coverage',
  members: [
    {
      key: 'ivy',
      displayName: 'Ivy',
      email: infraUser.email,
      userKey: infraUser.key,
      groupAdmin: true,
    },
    { key: 'jo', displayName: 'Jo', email: '' },
    {
      key: 'kit',
      displayName: 'Kit',
      email: 'kit@pipsplit.test',
      active: false,
      leftGroup: true,
    },
    {
      key: 'lee',
      displayName: 'Lee',
      email: 'lee@pipsplit.test',
      invite: { sentDaysAgo: 2, sendCount: 3 },
    },
  ],
  categories: [{ key: 'general', name: 'General' }],
  expenses: [
    {
      key: 'x-rental',
      date: seedDaysAgo(5),
      description: 'Infra rental',
      categoryKey: 'general',
      paidByKey: 'ivy',
      totalAmount: 300,
      splitMethod: 'shares',
      splits: [
        { owedByKey: 'ivy', shares: 3 },
        { owedByKey: 'jo', shares: 3 },
        { owedByKey: 'lee', shares: 2 },
      ],
      rental: {
        nightCount: 3,
        stays: [
          { memberKey: 'ivy', nights: [0, 1, 2] },
          { memberKey: 'jo', nights: [0, 1, 2], roomId: 'loft' },
          { memberKey: 'lee', nights: [1, 2] },
        ],
        rooms: [{ id: 'loft', name: 'Loft', rate: 1.5 }],
      },
    },
    {
      key: 'x-receipt',
      date: seedDaysAgo(4),
      description: 'Infra receipt',
      categoryKey: 'general',
      paidByKey: 'ivy',
      totalAmount: 20,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ivy', assignedAmount: 10 },
        { owedByKey: 'jo', assignedAmount: 10 },
      ],
      receipt: { file: 'receipt.png', contentType: 'image/png' },
    },
  ],
  memorized: [
    {
      key: 'm-lunch',
      description: 'Infra memorized lunch',
      categoryKey: 'general',
      paidByKey: 'ivy',
      totalAmount: 40,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'ivy', assignedAmount: 20 },
        { owedByKey: 'jo', assignedAmount: 20 },
      ],
    },
  ],
};

const mail: Record<'error' | 'retry' | 'success' | 'pending', SeedMail> = {
  error: {
    key: 'mail-infra-error',
    to: infraUser.email,
    subject: 'Infra - Seeded error',
    state: 'ERROR',
    startedMinutesAgo: 30,
    error: 'Infra seeded SMTP failure',
  },
  retry: {
    key: 'mail-infra-retry',
    to: infraUser.email,
    subject: 'Infra - Seeded retry',
    state: 'RETRY',
    startedMinutesAgo: 20,
  },
  success: {
    key: 'mail-infra-success',
    to: infraUser.email,
    subject: 'Infra - Seeded success',
    state: 'SUCCESS',
    startedMinutesAgo: 10,
  },
  pending: {
    key: 'mail-infra-pending',
    to: infraUser.email,
    subject: 'Infra - Seeded pending',
    state: 'PENDING',
    startedMinutesAgo: 1,
  },
};

const listed: SeedAppError = {
  key: 'err-infra-listed',
  component: 'InfraSpec Listed',
  action: 'seed',
  message: 'Infra seeded app error',
  hoursAgo: 3,
};

export const INFRA = {
  users: { infraUser },
  group,
  mail,
  appErrors: { listed },
} as const;

export const INFRA_DATASET: SeedDataset = {
  name: 'infra',
  users: [infraUser],
  groups: [group],
  mail: Object.values(mail),
  appErrors: [listed],
};
