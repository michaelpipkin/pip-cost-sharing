import { DocumentReference } from 'firebase/firestore';
import { Category } from './category';
import { Expense } from './expense';
import { Member } from './member';

export class Group {
  constructor(init?: Partial<Group>) {
    Object.assign(this, init);
  }
  id: string;
  name: string;
  active: boolean;
  members: Member[];
  expenses: Expense[];
  categories: Category[];
  autoAddMembers: boolean;
  ref?: DocumentReference<Group>;
}
