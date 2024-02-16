export interface ISplit {
  id: string;
  expenseId: string;
  groupId: string;
  categoryId: string;
  amount: number;
  memberId: string;
  paid: boolean;
}

export class Split implements ISplit {
  constructor(init?: Partial<Split>) {
    Object.assign(this, init);
  }
  id: string;
  expenseId: string;
  groupId: string;
  categoryId: string;
  amount: number;
  memberId: string;
  paid: boolean = false;
}
