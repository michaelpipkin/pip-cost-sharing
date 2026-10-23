import { inject, Injectable } from '@angular/core';
import { Member } from '@models/member';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  callableError,
  isUnverifiedLoginRefusal,
} from '@utils/callable-error.util';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  documentId,
  DocumentData,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  QuerySnapshot,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  IMemberService,
  MemberEmailChangeStatus,
  MemberEmailUpdateResult,
} from './member.service.interface';
import { SortingService } from './sorting.service';

/**
 * How long getGroupMembers() waits for a server-confirmed snapshot before
 * publishing a cache-only one instead. See the comment there.
 */
const GROUP_MEMBERS_SYNC_TIMEOUT_MS = 2000;

/**
 * Callable error codes that are outcomes the UI reports to the user, not
 * failures to log: the daily request limit and a duplicate address
 * (requestMemberEmailChange), an expired/used link or another account
 * (confirmMemberEmailChange), and an unverified login email (both).
 */
const EXPECTED_EMAIL_CHANGE_CODES = new Set([
  'functions/resource-exhausted',
  'functions/already-exists',
  'functions/failed-precondition',
  'functions/permission-denied',
]);

/**
 * The snackbar text for an updateAllMemberEmails result (Account > Profile's
 * Sync and the group email update dialog).
 */
export function memberEmailUpdateMessage({
  updated,
  conflicts,
}: MemberEmailUpdateResult): string {
  const records = (n: number) => `${n} member ${n === 1 ? 'record' : 'records'}`;
  if (conflicts === 0) {
    return updated > 0
      ? `Updated email on ${records(updated)}`
      : 'No member records needed updating';
  }
  const updatedPart =
    updated > 0
      ? `Updated email on ${records(updated)}.`
      : 'No member records were updated.';
  const skipped =
    conflicts === 1
      ? '1 skipped because another member of that group already uses that address.'
      : `${conflicts} skipped because another member of each of those groups already uses that address.`;
  return `${updatedPart} ${skipped}`;
}

@Injectable({
  providedIn: 'root',
})
export class MemberService implements IMemberService {
  protected readonly userStore = inject(UserStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly fs = inject(getFirestore);
  protected readonly functions = inject(getFunctions);
  protected readonly sorter = inject(SortingService);
  protected readonly analytics = inject(AnalyticsService);

  #unsubscribe?: () => void;
  // The group the latest getMemberByUserRef() lookup is for (null once
  // listening stops), so a slower lookup for a group the user has since
  // switched away from can't overwrite currentMember.
  #currentMemberGroupId: string | null = null;

  // Canonical form for email comparisons - Firestore has no case-insensitive
  // query operator, so matches/lookups query the emailLower field (kept in
  // sync by the syncUserEmailLower/syncMemberEmailLower Cloud Functions
  // triggers) using this same normalization.
  #normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async getMemberByUserRef(
    groupId: string,
    userRef: DocumentReference<User>
  ): Promise<void> {
    this.#currentMemberGroupId = groupId;
    try {
      const q = query(
        collection(this.fs, `groups/${groupId}/members`),
        where('userRef', '==', userRef),
        limit(1)
      );
      const docSnap = await getDocs(q);
      if (this.#currentMemberGroupId !== groupId) return;

      if (docSnap.empty) {
        this.memberStore.clearCurrentMember();
      } else {
        const memberDoc = docSnap.docs[0]!;
        this.memberStore.setCurrentMember(
          new Member({
            id: memberDoc.id,
            ...memberDoc.data(),
            ref: memberDoc.ref as DocumentReference<Member>, // NOSONAR
          })
        );
      }
    } catch (error) {
      this.analytics.logError(
        'Member Service',
        'getMemberByUserRef',
        'Failed to get member by user ref',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  getGroupMembers(groupId: string): void {
    this.#unsubscribe?.();
    const q = query(
      collection(this.fs, `groups/${groupId}/members`),
      orderBy('displayName')
    );

    // The first result can come from Firestore's in-memory cache, which holds
    // only the members this session has already read - after a refresh,
    // usually just the current member (from getMemberByUserRef). Publishing
    // that would mark the store loaded with a partial group, so the first
    // cache-only result is held back for a server-confirmed one instead.
    // That confirmation can be slow to arrive (observed hanging indefinitely
    // against the emulator, on a subcollection a local write had just primed
    // the cache for) - GROUP_MEMBERS_SYNC_TIMEOUT_MS bounds the wait, after
    // which the held-back result is published rather than leaving the page
    // stuck loading; a live update corrects it moments later if it was
    // genuinely incomplete.
    let settled = false;
    let pending: QuerySnapshot<DocumentData> | null = null;
    const publish = (querySnap: QuerySnapshot<DocumentData>) => {
      try {
        const groupMembers: Member[] = querySnap.docs.map(
          (doc) =>
            new Member({
              id: doc.id,
              ...doc.data(),
              ref: doc.ref as DocumentReference<Member>,
            })
        );
        this.memberStore.setGroupMembers(groupMembers);
      } catch (error) {
        this.analytics.logError(
          'Member Service',
          'getGroupMembers',
          'Failed to process group members snapshot',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    };
    const timeoutId = setTimeout(() => {
      if (settled || !pending) return;
      settled = true;
      publish(pending);
    }, GROUP_MEMBERS_SYNC_TIMEOUT_MS);

    const unsubscribeSnapshot = onSnapshot(
      q,
      (querySnap) => {
        if (!settled) {
          if (querySnap.metadata.fromCache) {
            pending = querySnap;
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
        }
        publish(querySnap);
      },
      (error) => {
        clearTimeout(timeoutId);
        this.analytics.logSnapshotError(
          'Member Service',
          'getGroupMembers',
          'Failed to listen to group members',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    );
    // Stopping the listener (directly, or by starting another one) must also
    // cancel the fallback timer, or it can still fire afterwards and publish
    // a stale snapshot to whichever group/store is current by then.
    this.#unsubscribe = () => {
      clearTimeout(timeoutId);
      unsubscribeSnapshot();
    };
  }

  stopListening(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#currentMemberGroupId = null;
  }

  async addMemberToGroup(
    groupId: string,
    member: Partial<Member>
  ): Promise<DocumentReference<Member>> {
    // Only check for duplicate email and attempt user matching when an email is provided.
    // A blank email means the member is not intended to sign in to the app.
    if (member.email) {
      const emailLower = this.#normalizeEmail(member.email);
      const membersQuery = query(
        collection(this.fs, `groups/${groupId}/members`),
        where('emailLower', '==', emailLower)
      );
      const membersSnapshot = await getDocs(membersQuery);

      if (!membersSnapshot.empty) {
        throw new Error(
          'A member with this email address already exists in the group.'
        );
      }

      // Linking by users.emailLower is safe only because a profile email is
      // always a VERIFIED address of that account: firestore.rules accepts a
      // client-written email/emailLower only when it is '' or the caller's
      // verified token email, and the sign-up trigger and session sync store
      // nothing until the address is verified (Plan 4 B14). Loosen either
      // and this lookup lets anyone claim someone else's invite.
      const userQuery = query(
        collection(this.fs, 'users'),
        where('emailLower', '==', emailLower)
      );
      const userSnapshot = await getDocs(userQuery);
      if (userSnapshot.size === 1) {
        member.userRef = userSnapshot.docs[0]!.ref as DocumentReference<User>; // NOSONAR
      } else if (userSnapshot.size > 1) {
        // Multiple accounts share this email (a pre-existing duplicate
        // account situation, not something this lookup created) - leave
        // the member unlinked rather than guessing which account is right.
        this.analytics.logError(
          'Member Service',
          'addMemberToGroup',
          'Ambiguous email match - multiple user accounts share this email, skipped auto-link',
          emailLower
        );
      }
    }

    // prettier-ignore
    return (await addDoc(// NOSONAR
      collection(this.fs, `groups/${groupId}/members`),
      member
    )) as DocumentReference<Member>;
  }

  async updateMember(
    memberRef: DocumentReference<Member>,
    changes: Partial<Member>
  ): Promise<void> {
    // Check for duplicate email if email is being changed
    if (changes.email) {
      const q = query(
        memberRef.parent,
        where('emailLower', '==', this.#normalizeEmail(changes.email)),
        where(documentId(), '!=', memberRef.id)
      );
      const snap = await getDocs(q);

      if (snap.size > 0) {
        throw new Error(
          'A member with this email address already exists in the group.'
        );
      }
    }

    await updateDoc(memberRef, changes);
  }

  async updateMemberWithUserMatching(
    memberRef: DocumentReference<Member>,
    changes: Partial<Member>,
    currentUserRef: DocumentReference<User> | null,
    currentEmail: string
  ): Promise<void> {
    // Only search for user if member is not already linked and email is changing
    if (
      !currentUserRef &&
      changes.email &&
      this.#normalizeEmail(changes.email) !== this.#normalizeEmail(currentEmail)
    ) {
      // Safe only because profile emails are verified-only (see
      // addMemberToGroup).
      const userQuery = query(
        collection(this.fs, 'users'),
        where('emailLower', '==', this.#normalizeEmail(changes.email))
      );
      const userSnapshot = await getDocs(userQuery);
      if (userSnapshot.size === 1) {
        changes.userRef = userSnapshot.docs[0]!.ref as DocumentReference<User>; // NOSONAR
      } else if (userSnapshot.size > 1) {
        // Multiple accounts share this email (a pre-existing duplicate
        // account situation, not something this lookup created) - leave
        // the member unlinked rather than guessing which account is right.
        this.analytics.logError(
          'Member Service',
          'updateMemberWithUserMatching',
          'Ambiguous email match - multiple user accounts share this email, skipped auto-link',
          this.#normalizeEmail(changes.email)
        );
      }
    }

    await updateDoc(memberRef, changes);
  }

  async removeMemberFromGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<void> {
    const splits = await getDocs(
      collection(this.fs, `groups/${groupId}/splits`)
    );
    const memberSplit = splits.docs.some(
      (splitDoc) =>
        splitDoc.data().owedByMemberRef.eq(memberRef) ||
        splitDoc.data().paidByMemberRef.eq(memberRef)
    );

    if (memberSplit) {
      throw new Error('This member has existing splits and cannot be deleted.');
    }

    const memberSnap = await getDoc(memberRef);
    const removedUserRef = memberSnap.data()?.userRef;

    await deleteDoc(memberRef);

    if (removedUserRef) {
      const groupRef = doc(this.fs, `groups/${groupId}`);
      const removedUserSnap = await getDoc(removedUserRef);
      const removedDefault = removedUserSnap.data()?.defaultGroupRef;
      if (removedDefault?.eq(groupRef)) {
        await updateDoc(removedUserRef, { defaultGroupRef: null });
      }
    }
  }

  /**
   * Returns whether the member doc was deleted outright (no historical
   * splits) versus kept and re-tagged left/inactive (has history) - callers
   * need this to know whether the group should disappear entirely from
   * their group list or just be re-tagged as a rejoin candidate.
   */
  async leaveGroup(
    groupId: string,
    memberRef: DocumentReference<Member>
  ): Promise<{ deleted: boolean }> {
    const userRef = this.userStore.user()!.ref!;
    const c = collection(this.fs, `groups/${groupId}/members`);
    const q = query(c, where('groupAdmin', '==', true));
    const adminSnap = await getDocs(q);
    if (adminSnap.docs.length === 1 && adminSnap.docs[0]!.id === memberRef.id) {
      throw new Error(
        'You are the only group admin. Please assign another member as admin before leaving the group.'
      );
    }

    const splits = await getDocs(
      collection(this.fs, `groups/${groupId}/splits`)
    );
    const memberSplit = splits.docs.some(
      (doc) =>
        doc.data().owedByMemberRef.eq(memberRef) ||
        doc.data().paidByMemberRef.eq(memberRef)
    );

    let deleted: boolean;
    if (memberSplit) {
      await updateDoc(memberRef, {
        active: false,
        leftGroup: true,
        groupAdmin: false,
      });
      deleted = false;
    } else {
      await deleteDoc(memberRef);
      deleted = true;
    }
    await updateDoc(userRef, { defaultGroupRef: null });
    return { deleted };
  }

  // Self-service counterpart to leaveGroup(): the member's own action to
  // restore access after voluntarily leaving. Deliberately not callable by
  // an admin on someone else's behalf via the edit-member dialog - see
  // Member.leftGroup.
  async rejoinGroup(memberRef: DocumentReference<Member>): Promise<void> {
    await updateDoc(memberRef, { leftGroup: false, active: true });
  }

  /**
   * A member's change of their OWN linked row's group email (edit-member).
   * Firestore rules let a linked member's email hold only an address its
   * user has proven they own, so the server decides (functions/src/
   * member-email.ts): `updated` (their verified sign-in address, applied),
   * `unchanged`, or `pending` (a confirmation link was mailed to the new
   * address; nothing changes until it is used).
   */
  async requestMemberEmailChange(
    groupId: string,
    memberId: string,
    email: string
  ): Promise<MemberEmailChangeStatus> {
    try {
      const requestFn = httpsCallable<
        { groupId: string; memberId: string; email: string },
        { status: MemberEmailChangeStatus }
      >(this.functions, 'requestMemberEmailChange');
      const result = await requestFn({ groupId, memberId, email });
      return result.data.status;
    } catch (error) {
      this.#logUnexpected(
        error,
        'requestMemberEmailChange',
        'Failed to request member email change'
      );
      throw error;
    }
  }

  /** The confirmation link's page (/auth/confirm-group-email). */
  async confirmMemberEmailChange(
    token: string
  ): Promise<{ groupId: string; email: string }> {
    try {
      const confirmFn = httpsCallable<
        { token: string },
        { groupId: string; email: string }
      >(this.functions, 'confirmMemberEmailChange');
      const result = await confirmFn({ token });
      return result.data;
    } catch (error) {
      this.#logUnexpected(
        error,
        'confirmMemberEmailChange',
        'Failed to confirm member email change'
      );
      throw error;
    }
  }

  #logUnexpected(error: unknown, action: string, message: string): void {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && EXPECTED_EMAIL_CHANGE_CODES.has(code)) {
      return;
    }
    this.analytics.logError(
      'Member Service',
      action,
      message,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  /** The member records linked to the user, across every group. */
  #linkedMembersQuery(userRef: DocumentReference<User>) {
    return query(
      collectionGroup(this.fs, 'members'),
      where('userRef', '==', userRef)
    );
  }

  /**
   * The email on each member record linked to the user (one per group
   * membership), as stored. Used to tell how many memberships a login-email
   * change would touch.
   */
  async getLinkedMemberEmails(
    userRef: DocumentReference<User>
  ): Promise<string[]> {
    try {
      const membersSnapshot = await getDocs(this.#linkedMembersQuery(userRef));
      return membersSnapshot.docs.map((d) => d.data().email ?? '');
    } catch (error) {
      this.analytics.logError(
        'Member Service',
        'getLinkedMemberEmails',
        'Failed to get linked member emails',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Moves the user's member records to their verified login email, through
   * the updateMemberEmails callable (functions/src/member-email.ts): the
   * server reads the address from the Auth account (never from the client),
   * skips records already on it, and with `onlyFromEmail` writes only the
   * records on that address (case-insensitively), so an address set for one
   * group is kept. A record whose group already has another member on the
   * address is left alone and counted in `conflicts`. All or nothing: a
   * failure writes nothing, so the caller can simply retry.
   */
  async updateAllMemberEmails(
    onlyFromEmail?: string
  ): Promise<MemberEmailUpdateResult> {
    try {
      const updateFn = httpsCallable<
        { onlyFromEmail?: string },
        MemberEmailUpdateResult
      >(this.functions, 'updateMemberEmails');
      const { data } = await updateFn(
        onlyFromEmail === undefined ? {} : { onlyFromEmail }
      );
      this.analytics.logEvent('member_emails_updated', {
        membersUpdated: data.updated,
        memberConflicts: data.conflicts,
      });
      return data;
    } catch (error) {
      // Only the unverified-login refusal is an expected outcome here. The
      // rest, LOGIN_EMAIL_INVALID (a legacy account the owner should hear
      // about) included, are logged with the server's message.
      if (!isUnverifiedLoginRefusal(error)) {
        this.analytics.logError(
          'Member Service',
          'updateAllMemberEmails',
          'Failed to update member emails',
          callableError(error).message || 'Unknown error'
        );
      }
      throw error;
    }
  }
}
