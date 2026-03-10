import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

export interface IUserService {
  getUserDetails(userId: string): Promise<User | null>;
  updateUser(changes: Partial<User>): Promise<void>;
  getPaymentMethods(memberRef: DocumentReference<Member>): Promise<object>;
  sendPaymentRequestEmail(
    owedByMember: Member,
    owedToMember: Member,
    groupName: string,
    formattedAmount: string
  ): Promise<'sent' | 'not_registered' | 'opted_out'>;
  sendGroupPaymentRequestEmails(
    transfers: { owedByMember: Member; owedToMember: Member; formattedAmount: string }[],
    groupName: string
  ): Promise<{ sent: number; skipped: number }>;
  sendMemberPaymentUnpayEmails(
    paidByMember: Member | undefined,
    paidToMember: Member | undefined,
    groupName: string,
    formattedAmount: string,
    splitCount: number
  ): Promise<void>;
  sendGroupSettleUnpayEmails(
    members: Member[],
    groupName: string,
    settleDate: string
  ): Promise<void>;
  logout(): void;
}
