import { Group } from '@models/group';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

export interface IUserService {
  getUserDetails(userId: string): Promise<User | null>;
  saveDefaultGroup(groupRef: DocumentReference<Group>): Promise<void>;
  updateUser(changes: Partial<User>): Promise<void>;
  getPaymentMethods(groupId: string, memberId: string): Promise<object>;
  logout(): void;
}
