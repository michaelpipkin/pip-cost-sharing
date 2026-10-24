import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

/** requestMemberEmailChange's outcome (functions/src/member-email.ts). */
export type MemberEmailChangeStatus = 'unchanged' | 'updated' | 'pending';

/** updateMemberEmails' outcome (functions/src/member-email.ts). */
export interface MemberEmailUpdateResult {
  /** Records moved to the verified login email. */
  updated: number;
  /** Records left alone: another member of that group has the address. */
  conflicts: number;
}

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
  requestMemberEmailChange(
    groupId: string,
    memberId: string,
    email: string
  ): Promise<MemberEmailChangeStatus>;
  confirmMemberEmailChange(
    token: string
  ): Promise<{ groupId: string; email: string }>;
  updateAllMemberEmails(
    onlyFromEmail?: string
  ): Promise<MemberEmailUpdateResult>;
  removeMemberFromGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<any>;
}
