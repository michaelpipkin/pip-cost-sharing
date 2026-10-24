/**
 * A payee's payment handles, as getMemberPaymentMethods returns them
 * (functions/src/payment-methods.ts): empty strings for any handle the
 * payee never set, or for all of them when the member has no account.
 */
export interface PaymentMethods {
  venmoId: string;
  paypalId: string;
  cashAppId: string;
  zelleId: string;
}
