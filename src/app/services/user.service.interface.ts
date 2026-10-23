import { Member } from '@models/member';
import { PaymentMethods } from '@models/payment-methods';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';

/** sendPaymentRequests' per-request outcome (functions/src/group-emails.ts). */
export type PaymentRequestResult = 'sent' | 'not_registered' | 'opted_out';

/**
 * What a multi-call group email sent. `limitReached`: a later call was
 * refused by the caller's daily group-mail limit, so the rest went unsent
 * (`sent` counts only the calls before it).
 */
export interface GroupEmailOutcome {
  sent: number;
  limitReached: boolean;
}

export interface IUserService {
  getUserDetails(userId: string): Promise<User | null>;
  updateUser(changes: Partial<User>): Promise<void>;
  getPaymentMethods(
    memberRef: DocumentReference<Member>
  ): Promise<PaymentMethods>;
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
  ): Promise<GroupEmailOutcome & { skipped: number }>;
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
  ): Promise<GroupEmailOutcome>;
  logout(): Promise<void>;
}
