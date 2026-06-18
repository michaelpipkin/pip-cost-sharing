/**
 * Scratch file — edit this for your ad hoc queries and run:
 *   pnpm query
 *
 * The `db` object is the Firestore Admin SDK instance (bypasses security rules).
 * The `auth` object gives access to Firebase Auth data (e.g. user creation times).
 *
 * See examples/ for ready-made patterns.
 */
import { db, logCount } from './lib.ts';

// Example: total user count
const usersSnap = await db.collection('users').count().get();
logCount('Total users (including admin)', usersSnap.data().count);
