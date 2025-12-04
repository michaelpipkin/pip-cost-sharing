import { DocumentReference } from 'firebase/firestore';
import { Group } from './group';

export class User {
  constructor(init?: Partial<User>) {
    Object.assign(this, init);
  }
  id: string;
  email: string;
  defaultGroupRef?: DocumentReference<Group> | null;
  venmoId?: string = '';
  paypalId?: string = '';
  cashAppId?: string = '';
  zelleId?: string = '';
  language?: string = 'en';
  receiptPolicy?: boolean = false;
  ref?: DocumentReference<User>;
}
