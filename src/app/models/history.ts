import { DocumentReference, Timestamp } from 'firebase/firestore';

export interface IHistory {
  id: string;
  date: Timestamp;
  paidByMemberRef: DocumentReference;
  paidToMemberRef: DocumentReference;
  toalPaid: number;
  lineItems: { category: string; amount: number }[];
}

export class History implements IHistory {
  constructor(init?: Partial<History>) {
    Object.assign(this, init);
  }
  id: string;
  date: Timestamp;
  paidByMemberRef: DocumentReference;
  paidToMemberRef: DocumentReference;
  toalPaid: number;
  lineItems: { category: string; amount: number }[];
}
