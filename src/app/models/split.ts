import { Timestamp } from 'firebase/firestore';

export interface ISplit {
  id: string;
  expenseId: string;
  date: Timestamp;
  categoryId: string;
  assignedAmount: number;
  allocatedAmount: number;
  paidByMemberId: string;
  owedByMemberId: string;
  paid: boolean;
  groupId: string;
}

export class Split implements ISplit {
  constructor(init?: Partial<Split>) {
    Object.assign(this, init);
  }
  id: string;
  expenseId: string;
  date: Timestamp;
  categoryId: string;
  assignedAmount: number;
  allocatedAmount: number;
  paidByMemberId: string;
  owedByMemberId: string;
  paid: boolean = false;
  groupId: string;
}
