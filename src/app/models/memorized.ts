import { Split } from './split';

export class Memorized {
  constructor(init?: Partial<Memorized>) {
    Object.assign(this, init);
  }
  id: string;
  description: string;
  categoryId: string;
  paidByMemberId: string;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splitByPercentage: boolean = false;
  splits: Partial<Split>[];
}
