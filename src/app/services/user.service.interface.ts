import { Member } from '@models/member';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

/** sendPaymentRequests' per-request outcome (functions/src/group-emails.ts). */
export type PaymentRequestResult = 'sent' | 'not_registered' | 'opted_out';

export interface IUserService {
  getUserDetails(userId: string): Promise<User | null>;
  updateUser(changes: Partial<User>): Promise<void>;
  getPaymentMethods(memberRef: DocumentReference<Member>): Promise<object>;
  sendPaymentRequestEmail(
    groupId: string,
    owedByMemberRef: DocumentReference<Member>,
    owedToMemberRef: DocumentReference<Member>,
    amount: number
  ): Promise<PaymentRequestResult>;
  sendGroupPaymentRequestEmails(
    groupId: string,
    transfers: {
      owedByMemberRef: DocumentReference<Member>;
      owedToMemberRef: DocumentReference<Member>;
      amount: number;
    }[]
  ): Promise<{ sent: number; skipped: number }>;
  sendMemberPaymentUnpayEmails(
    groupId: string,
    paidByMemberRef: DocumentReference<Member>,
    paidToMemberRef: DocumentReference<Member>,
    amount: number,
    splitCount: number
  ): Promise<void>;
  sendGroupSettleUnpayEmails(
    groupId: string,
    memberRefs: DocumentReference<Member>[],
    settleDate: Date
  ): Promise<void>;
  logout(): Promise<void>;
}
