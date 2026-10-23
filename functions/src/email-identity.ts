// Dependency-free email helpers, shared with the admin scripts
// (scripts/db/profile-email-audit.ts, scripts/db/queries/
// backfill-orphaned-registrations.ts) so they can't drift from the server.
// Re-exported from common.ts for the functions code.

// Canonical form for email comparisons - Firestore has no case-insensitive
// query operator, and email casing isn't meaningful for matching in
// practice, so every match/lookup normalizes through this first.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// The verifiedEmails/{id} doc id for an address: the normalized address with
// '%' escaped first and then '/' (a doc id can't contain '/'). Escaping '%'
// first keeps the mapping one-to-one, so two addresses never share an id.
export function verifiedEmailId(address: string): string {
  return normalizeEmail(address).replace(/%/g, '%25').replace(/\//g, '%2F');
}

// The address a users/{uid} profile may store for an Auth account: its email
// once verified, else ''. Invited members are linked to users by the profile
// email (users.emailLower), so an unverified address there would let anyone
// register with someone else's address and be linked to their invites.
// firestore.rules enforces the same for client writes
// (userEmailFieldsOwned).
export function profileEmail(user: {
  email?: string;
  emailVerified?: boolean;
}): string {
  return user.emailVerified === true ? (user.email ?? '') : '';
}
