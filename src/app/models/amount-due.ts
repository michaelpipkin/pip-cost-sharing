import { DocumentReference } from 'firebase/firestore';
import { Category } from './category';

export class AmountDue {
  constructor(init?: Partial<AmountDue>) {
    Object.assign(this, init);
  }
  owedByMemberId: string;
  owedToMemberId: string;
  categoryId: string;
  categoryRef: DocumentReference<Category>;
  amount: number;
}
