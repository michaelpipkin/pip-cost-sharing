import { DocumentReference, Timestamp } from 'firebase/firestore';
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
  categoryId: string;
  categoryRef: DocumentReference<Category>;
  categoryName?: string;
  paidByMemberId: string;
  paidByMemberRef: DocumentReference<Member>;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splitByPercentage: boolean = false;
  splits: Split[];
  hasReceipt: boolean = false;
  paid: boolean = false;
  ref?: DocumentReference<Expense>;
  get unpaidAmount(): number {
    let amount = 0;
    this.splits.forEach((split) => {
      if (!split.paid && !(split.owedByMemberRef === this.paidByMemberRef)) {
        amount += split.allocatedAmount;
      }
    });
    return amount;
  }
}
