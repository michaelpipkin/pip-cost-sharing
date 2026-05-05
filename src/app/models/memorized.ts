import { DocumentReference } from 'firebase/firestore';
import { Category } from './category';
import { Member } from './member';
import { Split } from './split';
import { SplitMethod } from '@utils/split-method';

export class Memorized {
  constructor(init?: Partial<Memorized>) {
    Object.assign(this, init);
  }
  id!: string;
  description!: string;
  categoryRef!: DocumentReference<Category>;
  category?: Category;
  paidByMemberRef!: DocumentReference<Member>;
  paidByMember?: Member;
  sharedAmount!: number;
  allocatedAmount!: number;
  totalAmount!: number;
  splitMethod: SplitMethod = 'amount';
  splits!: Partial<Split>[];
  ref?: DocumentReference<Memorized>;
}

// Serializable version for router state
export interface SerializableMemorized {
  id: string;
  description: string;
  categoryId: string;
  paidByMemberId: string;
  sharedAmount: number;
  allocatedAmount: number;
  totalAmount: number;
  splitMethod: SplitMethod;
  splits: {
    assignedAmount: number;
    percentage: number;
    shares: number;
    allocatedAmount: number;
    owedByMemberId?: string;
  }[];
}
