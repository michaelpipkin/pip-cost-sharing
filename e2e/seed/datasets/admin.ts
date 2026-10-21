import type { SeedAppError, SeedDataset, SeedMail } from '../types';

/**
 * Owned by e2e/admin/admin.spec.ts. No groups and no users of its own: the
 * spec signs in as SHARED.users.admin (the app owner, so the admin guard and
 * the report function accept it) and, for the non-admin check, as
 * SHARED.users.bob. Both visits are read-only.
 *
 * mail and app_errors are global collections that other specs write at
 * runtime, so the spec finds its rows only by the subjects and component
 * names below, never by position or total.
 *
 * - Mail (always written with a delivery block, so sendMailQueueEmail skips
 *   them and the state stays as seeded; nothing is ever sent, and the
 *   recipient is an address this spec owns):
 *   - "Admin – Seeded error" (ERROR) and "Admin – Seeded retry" (RETRY) are
 *     only read, by the state-filter test;
 *   - "Admin – Delete me" (ERROR) is deleted by the delete test.
 * - App errors (the log lists the last 7 days, the seed is hours old):
 *   - "AdminSpec Listed" twice with the same action and message: two rows
 *     individually, one row with a count of 2 when grouped (read-only);
 *   - "AdminSpec Delete" once, deleted by the error-log test.
 */

const RECIPIENT = 'admin-spec@pipsplit.test';

const mail: Record<'error' | 'retry' | 'deleteMe', SeedMail> = {
  error: {
    key: 'mail-admin-error',
    to: RECIPIENT,
    subject: 'Admin – Seeded error',
    state: 'ERROR',
    startedMinutesAgo: 30,
    error: 'Admin seeded SMTP failure',
  },
  retry: {
    key: 'mail-admin-retry',
    to: RECIPIENT,
    subject: 'Admin – Seeded retry',
    state: 'RETRY',
    startedMinutesAgo: 25,
  },
  deleteMe: {
    key: 'mail-admin-delete-me',
    to: RECIPIENT,
    subject: 'Admin – Delete me',
    state: 'ERROR',
    startedMinutesAgo: 20,
    error: 'Admin seeded delete-me failure',
  },
};

const appErrors: Record<'listedFirst' | 'listedSecond' | 'deleteMe', SeedAppError> = {
  listedFirst: {
    key: 'err-admin-listed-1',
    component: 'AdminSpec Listed',
    action: 'seed_listed',
    message: 'Admin seeded repeated error',
    hoursAgo: 2,
  },
  listedSecond: {
    key: 'err-admin-listed-2',
    component: 'AdminSpec Listed',
    action: 'seed_listed',
    message: 'Admin seeded repeated error',
    hoursAgo: 1,
  },
  deleteMe: {
    key: 'err-admin-delete-me',
    component: 'AdminSpec Delete',
    action: 'seed_delete',
    message: 'Admin seeded delete-me error',
    hoursAgo: 3,
  },
};

export const ADMIN = { mail, appErrors } as const;

export const ADMIN_DATASET: SeedDataset = {
  name: 'admin',
  users: [],
  groups: [],
  mail: Object.values(mail),
  appErrors: Object.values(appErrors),
};
