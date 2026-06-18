/**
 * Count users registered in the last N days, via Firebase Auth.
 *
 * Why Auth and not Firestore?
 * The `users` Firestore collection has no createdDate/timestamp field — only the
 * Firebase Auth record carries `metadata.creationTime`.  This script pages through
 * all auth users (1000 per page) and filters by that timestamp.
 *
 * Run: pnpm exec tsx examples/users-last-7-days.ts
 * Adjust DAYS below as needed.
 */
import { auth } from '../lib.ts';

const DAYS = 7;
const cutoffMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;

let count = 0;
let pageToken: string | undefined;

do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    const createdMs = new Date(user.metadata.creationTime).getTime();
    if (createdMs >= cutoffMs) {
      count++;
    }
  }
  pageToken = page.pageToken;
} while (pageToken);

console.log(`Users registered in the last ${DAYS} days: ${count}`);
