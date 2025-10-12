import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

export interface IUserService {
  getUserDetails(userId: string): Promise<User | null>;
  updateUser(changes: Partial<User>): Promise<void>;
  getPaymentMethods(memberRef: DocumentReference<Member>): Promise<object>;
  logout(): void;
}
