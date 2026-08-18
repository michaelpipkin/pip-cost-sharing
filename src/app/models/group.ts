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
  // Denormalized member UIDs, maintained server-side by syncGroupMemberUids.
  // Clients must never write these fields directly.
  //  - memberUids: everyone ever linked (read access, even after leaving)
  //  - activeMemberUids: memberUids currently active === true (write access)
  //  - adminUids: activeMemberUids currently groupAdmin === true (group-doc admin actions)
  memberUids: string[] = [];
  activeMemberUids: string[] = [];
  adminUids: string[] = [];
  ref?: DocumentReference<Group>;
  userActiveInGroup?: boolean;
  // True if the current user's own membership in this group has
  // leftGroup:true (see Member.leftGroup) - i.e. they left voluntarily.
  userLeftGroup?: boolean;
  userIsAdmin?: boolean;
  // The current user's own member doc ref in this group, if they have one.
  // Needed for self-service actions (e.g. rejoinGroup) that must target the
  // user's own membership record without a separate lookup.
  userMemberRef?: DocumentReference<Member>;
}
