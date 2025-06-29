import { DocumentReference } from 'firebase/firestore';
import { Category } from './category';
import { Member } from './member';

export class AmountDue {
  constructor(init?: Partial<AmountDue>) {
    Object.assign(this, init);
  }
  owedByMemberRef: DocumentReference<Member>;
  owedToMemberRef: DocumentReference<Member>;
  categoryRef: DocumentReference<Category>;
  amount: number;
}
