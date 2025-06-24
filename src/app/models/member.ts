import { DocumentReference } from 'firebase/firestore';

export class Member {
  constructor(init?: Partial<Member>) {
    Object.assign(this, init);
  }
  id: string;
  userId: string;
  displayName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
  ref?: DocumentReference<Member>;
}
