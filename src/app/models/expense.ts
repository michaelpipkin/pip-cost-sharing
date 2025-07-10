import { DocumentReference, Timestamp } from 'firebase/firestore';
import { getStorage, ref, StorageReference } from 'firebase/storage';
import { Category } from './category';
import { Member } from './member';
import { Split } from './split';

export class Expense {
  constructor(init?: Partial<Expense>) {
    Object.assign(this, init);
  }
  id: string;
  date: Timestamp;
  description: string;
  categoryRef: DocumentReference<Category>;
  categoryName?: string;
  paidByMemberRef: DocumentReference<Member>;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splitByPercentage: boolean = false;
  splits: Split[];
  receiptPath?: string | null; // Store the storage path as a string
  paid: boolean = false;
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
