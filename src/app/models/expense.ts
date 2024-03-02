import { Timestamp } from 'firebase/firestore';
import { Split } from './split';

export interface IExpense {
  id: string;
  groupId: string;
  date: Timestamp;
  description: string;
  categoryId: string;
  paidByMemberId: string;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splits: Split[];
  readonly unpaidAmount: number;
  readonly paid: boolean;
}

export class Expense implements IExpense {
  constructor(init?: Partial<Expense>) {
    Object.assign(this, init);
  }
  id: string;
  groupId: string;
  date: Timestamp;
  description: string;
  categoryId: string;
  paidByMemberId: string;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splits: Split[];
  get unpaidAmount(): number {
    let amount = 0;
    this.splits.forEach((split) => {
      if (!split.paid && !(split.owedByMemberId === this.paidByMemberId)) {
        amount += split.allocatedAmount;
      }
    });
    return amount;
  }
  get paid(): boolean {
    return this.unpaidAmount === 0;
  }
}
