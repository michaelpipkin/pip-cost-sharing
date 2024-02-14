import { Split } from './split';

export interface IExpense {
  id: string;
  paidByUserId: string;
  amount: number;
  splits: Split[];
  readonly unpaidAmount: number;
  readonly paid: boolean;
}

export class Expense implements IExpense {
  constructor(init?: Partial<Expense>) {
    Object.assign(this, init);
  }
  id: string;
  paidByUserId: string;
  amount: number;
  splits: Split[];
  get unpaidAmount(): number {
    let amount = 0;
    this.splits.forEach((split) => {
      if (!split.paid && !(split.userId === this.paidByUserId)) {
        amount += split.amount;
      }
    });
    return amount;
  }
  get paid(): boolean {
    return this.unpaidAmount === 0;
  }
}
