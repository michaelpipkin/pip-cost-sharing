import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

export interface IGroupService {
  getUserGroups(user: User): Promise<void>;
  getGroup(groupId: string, userRef: DocumentReference<User>): Promise<void>;
  addGroup(group: Partial<Group>, member: Partial<Member>): Promise<any>;
  updateGroup(
    groupRef: DocumentReference<Group>,
    changes: Partial<Group>
  ): Promise<any>;
  logout(): void;
}
