import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

export interface IMemberService {
  getMemberByUserRef(
    groupId: string,
    userRef: DocumentReference<User>
  ): Promise<void>;
  getGroupMembers(groupId: string): void;
  addMemberToGroup(groupId: string, member: Partial<Member>): Promise<any>;
  updateMember(
    memberRef: DocumentReference<Member>,
    changes: Partial<Member>
  ): Promise<any>;
  updateMemberWithUserMatching(
    memberRef: DocumentReference<Member>,
    changes: Partial<Member>,
    currentUserRef: DocumentReference<User> | null,
    currentEmail: string
  ): Promise<void>;
  removeMemberFromGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<any>;
}
