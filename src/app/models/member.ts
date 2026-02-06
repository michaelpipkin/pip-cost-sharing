import { DocumentReference } from 'firebase/firestore';
import { User } from './user';

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
