import { DocumentReference } from 'firebase/firestore';
import { Member } from './member';
import { Split } from './split';

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
  splitsPaid: DocumentReference<Split>[] | null = null;
  ref?: DocumentReference<History>;
}

export type HistoryDto = Omit<History, 'date'> & { date: string };
