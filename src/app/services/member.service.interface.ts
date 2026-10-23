import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

/** requestMemberEmailChange's outcome (functions/src/member-email.ts). */
export type MemberEmailChangeStatus = 'unchanged' | 'updated' | 'pending';

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
  requestMemberEmailChange(
    groupId: string,
    memberId: string,
    email: string
  ): Promise<MemberEmailChangeStatus>;
  confirmMemberEmailChange(
    token: string
  ): Promise<{ groupId: string; email: string }>;
  removeMemberFromGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<any>;
}
