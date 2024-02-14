import { Expense } from './expense';

export interface IGroup {
  id: string;
  memberIds: string[];
  expenses: Expense[];
}

export class Group implements IGroup {
  constructor(init?: Partial<Group>) {
    Object.assign(this, init);
  }
  id: string;
  memberIds: string[];
  expenses: Expense[];
}
