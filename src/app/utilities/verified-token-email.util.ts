import { Auth } from 'firebase/auth';
import { isSingleEmailAddress } from './email-validation';

/**
 * The signed-in user's address from a freshly refreshed ID token when it is
 * verified and one valid address, else ''. A linked member's email may be
 * self-written only when it equals this address (firestore.rules), so the
 * writes that sync member emails to the login email take it from here, not
 * from the profile copy, which can lag a login-email change.
 */
export async function verifiedTokenEmail(auth: Auth): Promise<string> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return '';
  const { claims } = await firebaseUser.getIdTokenResult(true);
  const email = claims['email'];
  return claims['email_verified'] === true && isSingleEmailAddress(email)
    ? email
    : '';
}
