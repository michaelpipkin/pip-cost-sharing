/**
 * Declarative shape of the deterministic e2e data set. Every `key` on a
 * group, member, category, expense or payment is also that Firestore
 * document's ID (users are keyed by `uid`), so tests can build URLs and refs
 * from the dataset constants without a manifest.
 */

/**
 * Who may touch a group's data:
 * - 'shared': read-only for every spec.
 * - 'spec:<path>': only that spec may read or write it, e.g.
 *   'spec:e2e/history/history.spec.ts'.
 */
export type Owner = 'shared' | `spec:${string}`;

export interface SeedUserProfile {
  venmoId?: string;
  paypalId?: string;
  cashAppId?: string;
  zelleId?: string;
  language?: string;
  receiptPolicy?: boolean;
  emailOptOut?: boolean;
  /** Key of a SeedGroup; written as `defaultGroupRef`. */
  defaultGroupKey?: string;
}

export interface SeedUser {
  key: string;
  uid: string;
  email: string;
  password: string;
  profile?: SeedUserProfile;
}

export interface SeedMember {
  key: string;
  displayName: string;
  /** Blank for a placeholder member who never signs in. */
  email: string;
  /** Key of the SeedUser this member is linked to (`userRef`). */
  userKey?: string;
  active?: boolean;
  groupAdmin?: boolean;
  /**
   * Left the group voluntarily (member.service leaveGroup): written as
   * `leftGroup: true`, so the member must also be `active: false`.
   */
  leftGroup?: boolean;
  /**
   * An invitation already sent to this (unregistered) member, as
   * sendGroupInvite records it: written as
   * `invite: { lastSentAt, lastSentTo: <member email>, sendCount }`.
   */
  invite?: { sentDaysAgo: number; sendCount: number };
}

export interface SeedCategory {
  key: string;
  name: string;
  active?: boolean;
}

export interface SeedSplitInput {
  owedByKey: string;
  /** splitMethod 'amount'. */
  assignedAmount?: number;
  /** splitMethod 'percentage' (the last split absorbs the remainder to 100). */
  percentage?: number;
  /** splitMethod 'shares'. */
  shares?: number;
}

export interface SeedExpense {
  key: string;
  /** YYYY-MM-DD, as the app stores it. */
  date: string;
  description: string;
  categoryKey: string;
  paidByKey: string;
  totalAmount: number;
  splitMethod: 'amount' | 'percentage' | 'shares';
  /** 'amount' only: the evenly shared pool. */
  sharedAmount?: number;
  /** 'amount' only: the proportional pool. */
  allocatedAmount?: number;
  splits: SeedSplitInput[];
  /** Marks every split (and the expense) paid, without writing history. */
  paid?: boolean;
  /**
   * Vacation-rental occupancy, written as the expense's `rental` field.
   * Only valid with splitMethod 'shares', whose shares the dataset author
   * supplies (the seeder does not derive them from the occupancy).
   */
  rental?: SeedRental;
  /**
   * A stored receipt: `file` is a name under e2e/fixtures/files. Sets
   * `receiptPath` to groups/{group}/receipts/{expense key} and uploads the
   * file's bytes to the Storage emulator at that path.
   */
  receipt?: { file: string; contentType: string };
}

export interface SeedRentalStay {
  memberKey: string;
  /** 0-based night indices, each in [0, nightCount). */
  nights: number[];
  /** Must name one of the rental's `rooms`. */
  roomId?: string;
}

export interface SeedRentalRoom {
  id: string;
  name: string;
  rate: number;
}

export interface SeedRental {
  nightCount: number;
  stays: SeedRentalStay[];
  rooms?: SeedRentalRoom[];
}

/**
 * A memorized (template) expense, written to groups/{group}/memorized/{key}
 * the way add-memorized does: splits embedded as an array, no date, paid flag
 * or receipt. Split inputs follow the same rules as an expense's.
 */
export interface SeedMemorized {
  key: string;
  description: string;
  categoryKey: string;
  paidByKey: string;
  totalAmount: number;
  splitMethod: 'amount' | 'percentage' | 'shares';
  /** 'amount' only: the evenly shared pool. */
  sharedAmount?: number;
  /** 'amount' only: the proportional pool. */
  allocatedAmount?: number;
  splits: SeedSplitInput[];
}

/**
 * Settles the unpaid splits between one pair of members on the listed
 * expenses, the way summary.component's payment does: marks those splits
 * paid, marks each expense paid once all its splits are, and writes a
 * history doc (ID = key) for the net amount paidBy -> paidTo.
 */
export interface SeedPayment {
  key: string;
  date: string;
  paidByKey: string;
  paidToKey: string;
  expenseKeys: string[];
}

export interface SeedGroup {
  key: string;
  owner: Owner;
  /** Unique across all datasets - tests select groups by name in the UI. */
  name: string;
  active?: boolean;
  autoAddMembers?: boolean;
  currencyCode?: string;
  currencySymbol?: string;
  decimalPlaces?: number;
  members: SeedMember[];
  categories: SeedCategory[];
  expenses?: SeedExpense[];
  memorized?: SeedMemorized[];
  payments?: SeedPayment[];
}

export const MAIL_STATES = ['PENDING', 'PROCESSING', 'SUCCESS', 'ERROR', 'RETRY'] as const;
export type SeedMailState = (typeof MAIL_STATES)[number];

/**
 * A top-level `mail` doc (key = doc ID). Always written with a `delivery`
 * block, so the sendMailQueueEmail trigger skips it and the state stays as
 * seeded.
 */
export interface SeedMail {
  key: string;
  to: string;
  subject: string;
  state: SeedMailState;
  /** delivery.startTime is this many minutes before the seed run. */
  startedMinutesAgo: number;
  /** delivery.error; defaults to a generic message for ERROR and RETRY. */
  error?: string;
}

/** A top-level `app_errors` doc (key = doc ID), as logAppError writes it. */
export interface SeedAppError {
  key: string;
  component: string;
  action: string;
  message: string;
  /** timestamp is this many hours before the seed run. */
  hoursAgo: number;
}

export interface SeedDataset {
  name: string;
  users: SeedUser[];
  groups: SeedGroup[];
  /** Global collection: keys are unique across all datasets. */
  mail?: SeedMail[];
  /** Global collection: keys are unique across all datasets. */
  appErrors?: SeedAppError[];
}
