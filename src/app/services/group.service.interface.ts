import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';

export interface IGroupService {
  getUserGroups(user: User, autoNav: boolean): Promise<void>;
  getGroup(groupId: string, userId: string): Promise<void>;
  addGroup(group: Partial<Group>, member: Partial<Member>): Promise<any>;
  updateGroup(groupId: string, changes: Partial<Group>): Promise<any>;
  logout(): void;
}
