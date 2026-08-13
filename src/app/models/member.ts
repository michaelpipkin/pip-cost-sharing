import { DocumentReference, Timestamp } from 'firebase/firestore';
import { User } from './user';

export interface AddMemberForm {
  displayName: string;
  email: string;
}

export interface EditMemberForm {
  memberName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
}

/**
 * Record of app invitations sent to a member who has not registered yet.
 * Written only by the `sendGroupInvite` Cloud Function; the client never
 * writes this field. Absent on members who have never been invited.
 */
export interface MemberInvite {
  lastSentAt: Timestamp;
  lastSentTo: string;
  sendCount: number;
}

export class Member {
  constructor(init?: Partial<Member>) {
    Object.assign(this, init);
  }
  id!: string;
  userRef!: DocumentReference<User> | null;
  displayName!: string;
  email!: string;
  active!: boolean;
  groupAdmin!: boolean;
  // True if the member left the group voluntarily via leaveGroup() (as
  // opposed to being deactivated by an admin). Locks the Active toggle in
  // the edit-member dialog until the member rejoins themselves from their
  // own account settings. Undefined/missing is treated as false.
  leftGroup?: boolean;
  invite?: MemberInvite;
  ref?: DocumentReference<Member>;
}
