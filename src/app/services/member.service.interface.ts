import { Member } from '@models/member';

export interface IMemberService {
  getMemberByUserId(groupId: string, userId: string): Promise<void>;
  getGroupMembers(groupId: string): void;
  addMemberToGroup(groupId: string, member: Partial<Member>): Promise<any>;
  addManualMemberToGroup(
    groupId: string,
    member: Partial<Member>
  ): Promise<any>;
  updateMember(
    groupId: string,
    memberId: string,
    changes: Partial<Member>
  ): Promise<any>;
  removeMemberFromGroup(groupId: string, memberId: string): Promise<any>;
}
