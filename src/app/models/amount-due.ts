export interface IAmountDue {
  owedByMemberId: string;
  owedToMemberId: string;
  amount: number;
}

export class AmountDue implements IAmountDue {
  constructor(init?: Partial<AmountDue>) {
    Object.assign(this, init);
  }
  owedByMemberId: string;
  owedToMemberId: string;
  amount: number;
}
