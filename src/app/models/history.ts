import { DocumentReference } from 'firebase/firestore';
import { Member } from './member';

export class History {
  constructor(init?: Partial<History>) {
    Object.assign(this, init);
  }
  id!: string;
  date!: Date;
  paidByMemberRef!: DocumentReference<Member>;
  paidByMember?: Member;
  paidToMemberRef!: DocumentReference<Member>;
  paidToMember?: Member;
  totalPaid!: number;
  lineItems!: { category: string; amount: number }[];
  ref?: DocumentReference<History>;
}

export type HistoryDto = Omit<History, 'date'> & { date: string };
