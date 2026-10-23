/**
 * Seeds the verified-address index (`verifiedEmails/{id}`) from Firebase Auth
 * for accounts that existed before the index (users-read-lockdown design
 * §7.3). From now on the sign-up trigger, linkInvitedMembers and
 * confirmMemberEmailChange write it as addresses are proven; this fills it for
 * everyone already registered, so invited members still link to them.
 *
 * The source is Auth only: accounts with a verified email, never
 * users.email (a profile can hold an address the account never proved). Auth
 * login emails are unique, so the source itself has no conflicts. An entry
 * that already exists is never overwritten, because a newer confirmation wins
 * over a backfill: the same uid is a skip, another uid is a reported conflict.
 *
 * The decisions are pure functions (planVerifiedEmailBackfill,
 * planUnlinkedMembersWithOwner), tested without emulators by
 * scripts/db/verified-email-backfill.test.mjs. The I/O wrappers below them
 * take the Admin SDK handles from the caller, so the production query
 * (queries/backfill-verified-emails.ts, via lib.ts) shares this code.
 *
 * It never touches Auth accounts or member docs.
 */
import type { Auth } from 'firebase-admin/auth';
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  normalizeEmail,
  verifiedEmailId,
} from '../../functions/src/email-identity.ts';
import { ChunkedBatch } from './chunked-batch.ts';

const COLLECTION = 'verifiedEmails';

/** The parts of an Auth UserRecord the backfill reads. */
export interface BackfillAuthUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

export interface BackfillPlan {
  create: { id: string; email: string; uid: string }[];
  /** Addresses the same uid already owns. */
  skip: number;
  /** Addresses another uid owns: reported, never overwritten. */
  conflicts: { email: string; uid: string; ownerUid: string }[];
}

/**
 * What to write for `authUsers`, given the index as it is now (`existing`:
 * index id to uid). Unverified, email-less and non-user accounts are ignored.
 * An address planned earlier in the same run counts as owned, so no id is ever
 * planned twice.
 */
export function planVerifiedEmailBackfill(
  authUsers: readonly BackfillAuthUser[],
  existing: ReadonlyMap<string, string>,
  nonUserEmails: ReadonlySet<string>
): BackfillPlan {
  const plan: BackfillPlan = { create: [], skip: 0, conflicts: [] };
  const owners = new Map(existing);
  for (const user of authUsers) {
    if (!user.emailVerified || !user.email) continue;
    const email = normalizeEmail(user.email);
    if (!email || nonUserEmails.has(email)) continue;
    const id = verifiedEmailId(email);
    const ownerUid = owners.get(id);
    if (ownerUid === undefined) {
      owners.set(id, user.uid);
      plan.create.push({ id, email, uid: user.uid });
    } else if (ownerUid === user.uid) {
      plan.skip++;
    } else {
      plan.conflicts.push({ email, uid: user.uid, ownerUid });
    }
  }
  return plan;
}

/** An unlinked member row as scanned. */
export interface UnlinkedMemberRow {
  path: string;
  email: unknown;
}

export interface UnlinkedMemberWithOwner {
  memberPath: string;
  email: string;
  ownerUid: string;
}

/**
 * Report only: unlinked members whose address has an owner, in the index now
 * or after this plan's creates. They link on the owner's next Groups load or
 * through the admin repair. Blank-email rows are intentional placeholders.
 */
export function planUnlinkedMembersWithOwner(
  members: readonly UnlinkedMemberRow[],
  existing: ReadonlyMap<string, string>,
  plan: Pick<BackfillPlan, 'create'>
): UnlinkedMemberWithOwner[] {
  const owners = new Map(existing);
  for (const c of plan.create) if (!owners.has(c.id)) owners.set(c.id, c.uid);
  const rows: UnlinkedMemberWithOwner[] = [];
  for (const member of members) {
    if (typeof member.email !== 'string' || !normalizeEmail(member.email)) continue;
    const ownerUid = owners.get(verifiedEmailId(member.email));
    if (ownerUid !== undefined) {
      rows.push({ memberPath: member.path, email: member.email, ownerUid });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// I/O wrappers
// ---------------------------------------------------------------------------

/** Every Auth account (the source of the backfill). */
export async function listBackfillAuthUsers(auth: Auth): Promise<BackfillAuthUser[]> {
  const users: BackfillAuthUser[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken); // NOSONAR - each page needs the previous token
    for (const user of page.users) {
      users.push({ uid: user.uid, email: user.email, emailVerified: user.emailVerified });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

/** The index as it is now: id to owning uid. */
export async function readVerifiedEmailOwners(db: Firestore): Promise<Map<string, string>> {
  const snap = await db.collection(COLLECTION).select('uid').get();
  const owners = new Map<string, string>();
  for (const d of snap.docs) {
    const uid: unknown = d.get('uid');
    if (typeof uid === 'string') owners.set(d.id, uid);
  }
  return owners;
}

/** Member rows with no linked account (userRef == null). */
export async function readUnlinkedMembers(db: Firestore): Promise<UnlinkedMemberRow[]> {
  const snap = await db
    .collectionGroup('members')
    .where('userRef', '==', null)
    .select('email')
    .get();
  return snap.docs.map((d) => ({ path: d.ref.path, email: d.get('email') }));
}

/**
 * Writes the plan's entries with create() semantics, through ChunkedBatch.
 * Entries that exist now (written since the scan) are re-read and skipped, and
 * a create that still loses a race fails its batch rather than overwriting.
 * Returns the number created. On a failed batch the error says how many
 * writes had already committed (earlier batches stay committed; re-running
 * re-plans and picks up the rest).
 */
export async function applyVerifiedEmailBackfill(
  db: Firestore,
  plan: BackfillPlan
): Promise<number> {
  const refs = plan.create.map((c) => db.collection(COLLECTION).doc(c.id));
  const present = new Set<string>();
  const chunks: DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += 300) chunks.push(refs.slice(i, i + 300));
  for (const snap of (await Promise.all(chunks.map((c) => db.getAll(...c)))).flat()) {
    if (snap.exists) present.add(snap.id);
  }

  const toCreate = plan.create.filter((c) => !present.has(c.id));
  const verifiedAt = Timestamp.now();
  const batch = new ChunkedBatch(db);
  for (const c of toCreate) {
    batch.create(db.collection(COLLECTION).doc(c.id), {
      uid: c.uid,
      email: c.email,
      verifiedAt,
      source: 'backfill',
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    throw new Error(
      `Stopped after ${batch.committed} of ${toCreate.length} writes committed: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        'Re-run the dry run to see what is left.',
      { cause: error }
    );
  }
  return toCreate.length;
}
