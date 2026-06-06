import { DocumentReference } from 'firebase/firestore';
import { Category } from './category';
import { Expense } from './expense';
import { Member } from './member';

export interface GroupSelectorForm {
  selectedGroupRef: DocumentReference<Group> | null;
}

export interface AddGroupForm {
  groupName: string;
  displayName: string;
  autoAddMembers: boolean;
  currencyCode: string;
}

export interface ManageGroupForm {
  groupRef: DocumentReference<Group> | null;
  groupName: string;
  active: boolean;
  autoAddMembers: boolean;
  currencyCode: string;
}

export class Group {
  constructor(init?: Partial<Group>) {
    Object.assign(this, init);
  }
  id!: string;
  name!: string;
  active!: boolean;
  members!: Member[];
  expenses!: Expense[];
  categories!: Category[];
  autoAddMembers!: boolean;
  currencyCode!: string; // ISO 4217 code (USD, EUR, GBP, etc.)
  currencySymbol!: string; // Display symbol ($, €, £, etc.)
  decimalPlaces!: number; // Decimal precision (2 for most, 0 for JPY)
  archived: boolean = false;
  ref?: DocumentReference<Group>;
  userActiveInGroup?: boolean;
  userIsAdmin?: boolean;
}
