import { Timestamp } from 'firebase/firestore';

export interface ISplit {
  id: string;
  expenseId: string;
  date: Timestamp;
  categoryId: string;
  assignedAmount: number;
  percentage: number;
  allocatedAmount: number;
  paidByMemberId: string;
  owedByMemberId: string;
  paid: boolean;
}

export class Split implements ISplit {
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
