import { DocumentReference } from 'firebase/firestore';
import { User } from './user';

export interface AddMemberForm {
  displayName: string;
  email: string;
}

export interface EditMemberForm {
  memberName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
}

export class Member {
  constructor(init?: Partial<Member>) {
    Object.assign(this, init);
  }
  id!: string;
  userRef!: DocumentReference<User> | null;
  displayName!: string;
  email!: string;
  active!: boolean;
  groupAdmin!: boolean;
  ref?: DocumentReference<Member>;
}
