import { DocumentReference } from 'firebase/firestore';
import { Category } from './category';
import { Member } from './member';

export class AmountDue {
  constructor(init?: Partial<AmountDue>) {
    Object.assign(this, init);
  }
  owedByMemberRef!: DocumentReference<Member>;
  owedByMember?: Member;
  owedToMemberRef!: DocumentReference<Member>;
  owedToMember?: Member;
  categoryRef!: DocumentReference<Category>;
  category?: Category;
  amount!: number;
}
