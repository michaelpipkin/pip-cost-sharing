import { Timestamp } from 'firebase/firestore';

export class Split {
  constructor(init?: Partial<Split>) {
    Object.assign(this, init);
  }
  id: string;
  expenseId: string;
  date: Timestamp;
  categoryId: string;
  assignedAmount: number = 0;
  percentage: number = 0;
  allocatedAmount: number;
  paidByMemberId: string;
  owedByMemberId: string;
  paid: boolean = false;
}
