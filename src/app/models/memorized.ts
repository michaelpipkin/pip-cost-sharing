import { Split } from './split';

export interface IMemorized {
  id: string;
  description: string;
  categoryId: string;
  paidByMemberId: string;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splits: Partial<Split>[];
}

export class Memorized implements IMemorized {
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
  splits: Partial<Split>[];
}
