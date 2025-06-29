import { DocumentReference, Timestamp } from 'firebase/firestore';
import { Category } from './category';
import { Expense } from './expense';
import { Member } from './member';

export class Split {
  constructor(init?: Partial<Split>) {
    Object.assign(this, init);
  }
  id: string;
  // expenseId: string;
  expenseRef: DocumentReference<Expense>;
  date: Timestamp;
  // categoryId: string;
  categoryRef: DocumentReference<Category>;
  assignedAmount: number = 0;
  percentage: number = 0;
  allocatedAmount: number;
  // paidByMemberId: string;
  paidByMemberRef: DocumentReference<Member>;
  // owedByMemberId: string;
  owedByMemberRef: DocumentReference<Member>;
  paid: boolean = false;
  ref?: DocumentReference<Split>;
}
