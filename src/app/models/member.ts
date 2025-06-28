import { DocumentReference } from 'firebase/firestore';
import { User } from './user';

export class Member {
  constructor(init?: Partial<Member>) {
    Object.assign(this, init);
  }
  id: string;
  userId: string;
  userRef: DocumentReference<User>;
  displayName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
  ref?: DocumentReference<Member>;
}
