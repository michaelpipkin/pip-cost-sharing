import { DocumentReference, Timestamp } from 'firebase/firestore';
import { Category } from './category';
import { Expense } from './expense';
import { Member } from './member';

export class Split {
  constructor(init?: Partial<Split>) {
    Object.assign(this, init);
  }
  id: string;
  expenseRef: DocumentReference<Expense>;
  date: Timestamp;
  categoryRef: DocumentReference<Category>;
  category?: Category;
  assignedAmount: number = 0;
  percentage: number = 0;
  allocatedAmount: number;
  paidByMemberRef: DocumentReference<Member>;
  paidByMember?: Member;
  owedByMemberRef: DocumentReference<Member>;
  owedByMember?: Member;
  paid: boolean = false;
  ref?: DocumentReference<Split>;
}
