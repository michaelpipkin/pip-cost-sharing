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
  payments?: SeedPayment[];
}

export interface SeedDataset {
  name: string;
  users: SeedUser[];
  groups: SeedGroup[];
}
