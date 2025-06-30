import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

export interface IUserService {
  getUserDetails(userId: string): Promise<User | null>;
  saveDefaultGroup(groupRef: DocumentReference<Group>): Promise<void>;
  updateUser(changes: Partial<User>): Promise<void>;
  getPaymentMethods(memberRef: DocumentReference<Member>): Promise<object>;
  logout(): void;
}
