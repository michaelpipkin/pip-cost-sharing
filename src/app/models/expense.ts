import { DocumentReference } from 'firebase/firestore';
import { getStorage, ref, StorageReference } from 'firebase/storage';
import { Category } from './category';
import { Member } from './member';
import { Split } from './split';
import { SplitMethod } from '@utils/split-method';

export interface ExpenseSplitItemForm {
  owedByMemberRef: DocumentReference<Member> | null;
  assignedAmount: string;
  percentage: number | null;
  shares: number | null;
  allocatedAmount: number;
}

export interface ExpenseForm {
  paidByMember: DocumentReference<Member> | null;
  date: Date | null;
  amount: string;
  description: string;
  category: DocumentReference<Category> | null;
  sharedAmount: number;
  allocatedAmount: string;
  splits: ExpenseSplitItemForm[];
}

export interface MemorizedForm {
  paidByMember: DocumentReference<Member> | null;
  amount: string;
  description: string;
  category: DocumentReference<Category> | null;
  sharedAmount: number;
  allocatedAmount: string;
  splits: ExpenseSplitItemForm[];
}

/**
 * Per-night occupancy for a single participant in a vacation rental expense.
 * `nights` holds the 0-based indices of the nights this member stayed.
 */
export interface RentalStay {
  memberRef: DocumentReference<Member>;
  nights: number[];
}

/**
 * Occupancy details for a vacation rental expense, used to derive the
 * shares split (see RentalUtilsService). Persisted alongside the expense
 * so the occupancy grid can be reopened and edited later.
 */
export interface RentalDetails {
  nightCount: number;
  stays: RentalStay[];
}

/**
 * Serializable form of a rental wizard result, passed via router navigation
 * state from the Vacation Rental wizard to Add Expense (DocumentReferences
 * aren't structured-cloneable, so member associations travel as plain ids -
 * mirrors SerializableMemorized for the same reason).
 */
export interface SerializableRentalStay {
  memberId: string;
  nights: number[];
}

export interface SerializableRentalPayload {
  totalAmount: number;
  description: string;
  nightCount: number;
  stays: SerializableRentalStay[];
}

export class Expense {
  constructor(init?: Partial<Expense>) {
    Object.assign(this, init);
  }
  id!: string;
  date!: Date;
  description!: string;
  categoryRef!: DocumentReference<Category>;
  category?: Category;
  paidByMemberRef!: DocumentReference<Member>;
  paidByMember?: Member;
  sharedAmount!: number;
  allocatedAmount!: number;
  totalAmount!: number;
  splitMethod: SplitMethod = 'amount';
  splits!: Split[];
  receiptPath?: string | null; // Store the storage path as a string
  paid: boolean = false;
  /** Present only for expenses created via the Vacation Rental wizard. */
  rental?: RentalDetails | null;
  ref?: DocumentReference<Expense>;

  get hasReceipt(): boolean {
    return !!this.receiptPath;
  }
  get receiptRef(): StorageReference | null {
    if (!this.receiptPath) return null;
    return ref(getStorage(), this.receiptPath);
  }
  get unpaidAmount(): number {
    let amount = 0;
    this.splits.forEach((split) => {
      if (!split.paid && !split.owedByMemberRef.eq(this.paidByMemberRef)) {
        amount += split.allocatedAmount;
      }
    });
    return amount;
  }
}

export type ExpenseDto = Omit<Expense, 'date'> & { date: string };
