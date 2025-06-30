import { DocumentReference, Timestamp } from 'firebase/firestore';
import { Member } from './member';

export class History {
  constructor(init?: Partial<History>) {
    Object.assign(this, init);
  }
  id: string;
  date: Timestamp;
  paidByMemberRef: DocumentReference<Member>;
  paidToMemberRef: DocumentReference<Member>;
  totalPaid: number;
  lineItems: { category: string; amount: number }[];
  ref?: DocumentReference<History>;
}
