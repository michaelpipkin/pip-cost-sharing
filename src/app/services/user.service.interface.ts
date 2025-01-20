import { User } from '@models/user';

export interface IUserService {
  getUserDetails(userId: string): Promise<User | null>;
  saveDefaultGroup(groupId: string): Promise<void>;
  updateUser(changes: Partial<User>): Promise<void>;
  getPaymentMethods(groupId: string, memberId: string): Promise<object>;
  logout(): void;
}
