import { DocumentReference } from 'firebase/firestore';
import { Category } from './category';
import { Member } from './member';
import { Split } from './split';

export class Memorized {
  constructor(init?: Partial<Memorized>) {
    Object.assign(this, init);
  }
  id: string;
  description: string;
  categoryRef: DocumentReference<Category>;
  paidByMemberRef: DocumentReference<Member>;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splitByPercentage: boolean = false;
  splits: Partial<Split>[];
  ref?: DocumentReference<Memorized>;
}
