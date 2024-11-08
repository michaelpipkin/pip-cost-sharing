import { Category } from './category';
import { Expense } from './expense';
import { Member } from './member';

export interface IGroup {
  id: string;
  name: string;
  active: boolean;
  members: Member[];
  expenses: Expense[];
  categories: Category[];
  autoAddMembers: boolean;
}

export class Group implements IGroup {
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
}
