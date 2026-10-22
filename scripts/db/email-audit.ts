/**
 * Read-only audit of stored email addresses against the app's single-address
 * rule (Plan 4 task B12). Side-effect free: it takes the Admin SDK handles
 * from its caller, so the production query (queries/audit-invalid-emails.ts,
 * via lib.ts) and an emulator check can share it. It only reads.
 *
 * The rule is imported from the server copy (functions/src/email-builders.ts)
 * rather than copied, so this audit can never drift from what the Cloud
 * Functions, the forms and firestore.rules enforce.
 */
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { isSingleEmailAddress } from '../../functions/src/email-builders.ts';

export interface InvalidEmailRow {
  /** Auth uid, `users/{uid}` path, or the member doc path. */
  id: string;
  /** The stored value, JSON-encoded so null, arrays and whitespace show. */
  email: string;
}

export interface EmailAuditResult {
  authUsers: InvalidEmailRow[];
  userDocs: InvalidEmailRow[];
  members: InvalidEmailRow[];
}

/**
 * Whether a stored `email` would be refused by the rules if it were set
 * today: anything but a missing field, '' or one valid address (so null,
 * lists, arrays and `a@b`-style values count).
 */
export function isInvalidStoredEmail(value: unknown): boolean {
  return value !== undefined && value !== '' && !isSingleEmailAddress(value);
}

export async function auditInvalidEmails(
  db: Firestore,
  auth: Auth
): Promise<EmailAuditResult> {
  const authUsers: InvalidEmailRow[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      // An account without an email (none exist today: Google and
      // email/password only) has nothing to check.
      if (user.email !== undefined && !isSingleEmailAddress(user.email)) {
        authUsers.push({ id: user.uid, email: JSON.stringify(user.email) });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const userDocs: InvalidEmailRow[] = [];
  const usersSnap = await db.collection('users').select('email').get();
  for (const d of usersSnap.docs) {
    const email: unknown = d.get('email');
    if (isInvalidStoredEmail(email)) {
      userDocs.push({ id: d.ref.path, email: JSON.stringify(email) });
    }
  }

  const members: InvalidEmailRow[] = [];
  const membersSnap = await db.collectionGroup('members').select('email').get();
  for (const d of membersSnap.docs) {
    const email: unknown = d.get('email');
    if (isInvalidStoredEmail(email)) {
      members.push({ id: d.ref.path, email: JSON.stringify(email) });
    }
  }

  const byId = (a: InvalidEmailRow, b: InvalidEmailRow) => a.id.localeCompare(b.id);
  return {
    authUsers: authUsers.sort(byId),
    userDocs: userDocs.sort(byId),
    members: members.sort(byId),
  };
}
