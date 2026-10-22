import { MatSnackBar } from '@angular/material/snack-bar';
import { afterNextRender, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { Member } from '@models/member';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import { MemberLinkService } from '@services/member-link.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import { toIsoFormat } from '@utils/date-utils';
import { FirebaseError } from 'firebase/app';
import {
  browserLocalPersistence,
  User as FirebaseUser,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  doc,
  DocumentReference,
  DocumentSnapshot,
  FirestoreError,
  getDoc,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { appCheckTokenReady } from '../app-check';
import { GroupService } from './group.service';
import { IUserService, PaymentRequestResult } from './user.service.interface';

// Total attempts (initial + retries) for the login-time Firestore sequence
// below, and the fixed delay between them - short, bounded, and only ever
// invoked for the transient error codes checked by isTransientFirestoreError.
const LOGIN_SEQUENCE_MAX_ATTEMPTS = 3;
const LOGIN_SEQUENCE_RETRY_DELAY_MS = 2000;

// How long to wait for createUserProfileOnSignUp (see
// functions/src/user-onboarding.ts) to create a brand-new user's
// Firestore doc before falling back to creating it client-side.
const SERVER_USER_PROFILE_WAIT_TIMEOUT_MS = 8000;

// Auth errors meaning the session's tokens were revoked (e.g. by an email
// change), as opposed to a real failure.
const REVOKED_SESSION_CODES = new Set([
  'auth/user-token-expired',
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/invalid-user-token',
]);

function isRevokedSessionError(error: unknown): boolean {
  return error instanceof FirebaseError && REVOKED_SESSION_CODES.has(error.code);
}

// The most requests or member ids one group-email callable accepts
// (functions/src/group-emails.ts MAX_BATCH); must not exceed it.
const GROUP_EMAIL_BATCH = 25;

/** `items` in order, split into lists of at most GROUP_EMAIL_BATCH. */
function inBatches<T>(items: T[]): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += GROUP_EMAIL_BATCH) {
    batches.push(items.slice(i, i + GROUP_EMAIL_BATCH));
  }
  return batches;
}

/** The sign-in address once verified, else '' (see #syncProfileEmail). */
function verifiedEmail(firebaseUser: FirebaseUser): string {
  return firebaseUser.emailVerified ? (firebaseUser.email ?? '') : '';
}

@Injectable({
  providedIn: 'root',
})
export class UserService implements IUserService {
  protected readonly fs = inject(getFirestore);
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly groupService = inject(GroupService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly memorizedStore = inject(MemorizedStore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly splitStore = inject(SplitStore);
  protected readonly memberLinkService = inject(MemberLinkService);
  protected readonly functions = inject(getFunctions);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly loading = inject(LoadingService);
  protected readonly appCheckErrorHandler = inject(AppCheckErrorHandlerService);

  #intentionalLogout = false;
  #handlingSessionExpiry = false;
  // Set by account-action around a confirmed email change or recovery:
  // production Firebase revokes the session then, and that sign-out is
  // expected (the page itself says to sign in with the new address), so it
  // must not be reported as "Your session has expired".
  #expectingSignOut = false;

  constructor() {
    afterNextRender(async () => {
      await this.initializeAuth();
    });
  }

  // See #expectingSignOut. Cleared when the sign-out arrives, or by the
  // caller when the session survived.
  expectSignOut(expected: boolean): void {
    this.#expectingSignOut = expected;
  }

  private handleSessionExpired(): void {
    if (this.#expectingSignOut) {
      // Clear the signed-in state quietly: no snackbar, no redirect away
      // from the page that explains what happened.
      this.groupService.logout();
      this.userStore.clearUser();
      return;
    }
    if (this.#handlingSessionExpiry) return;
    this.#handlingSessionExpiry = true;
    this.groupService.logout();
    this.userStore.clearUser();
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: 'Your session has expired. Please sign in again.' },
    });
    this.router.navigate([ROUTE_PATHS.AUTH_LOGIN]);
  }

  // 'unavailable' and 'deadline-exceeded' are Firestore's own codes for a
  // transient network condition (Firestore's docs describe 'unavailable'
  // specifically as "most likely...corrected by retrying with a backoff")
  // - a dropped signal or a WiFi/cellular handoff lasting a few seconds,
  // nothing to do with App Check. 'permission-denied' (an App Check
  // rejection) is deliberately excluded - the SDK's own ~24h throttle
  // means an immediate retry cannot possibly help, so retrying it would
  // only delay showing the message the user actually needs to see.
  private isTransientFirestoreError(error: unknown): boolean {
    return (
      error instanceof FirebaseError &&
      (error.code === 'unavailable' || error.code === 'deadline-exceeded')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // When initializeAuth() throws, GroupService.getUserGroups() never runs,
  // so nothing would otherwise clear the loading overlay or explain why
  // the app looks stuck - the user is left staring at a spinner with no
  // way out. A `permission-denied` here (reading/writing their own user
  // doc, which security rules always allow the owner) almost always means
  // App Check rejected this device's requests rather than a real rules
  // violation - the account itself is fine, Firebase Auth succeeded, only
  // this specific client can't currently reach Firestore.
  private handleInitializeAuthFailure(error: unknown): void {
    this.loading.loadingOff();
    this.appCheckErrorHandler.handle(
      error,
      'Something went wrong loading your account. Please try again.'
    );
  }

  #requireUserId(): string {
    const userId = this.auth.currentUser?.uid;
    if (!userId) {
      this.handleSessionExpired();
      throw new Error('Your session has expired. Please sign in again.');
    }
    return userId;
  }

  // Retries only the transient Firestore codes (see
  // isTransientFirestoreError) up to LOGIN_SEQUENCE_MAX_ATTEMPTS times, a
  // fixed LOGIN_SEQUENCE_RETRY_DELAY_MS apart - short and bounded, since
  // the user is waiting for the app to load. createUserIfNotExists() is
  // safe to re-run on retry: it checks for an existing doc first, so a
  // partial success on an earlier attempt (e.g. the doc got created but
  // getUserGroups() then failed) just finds that doc on the next attempt
  // instead of erroring on a duplicate create.
  private async initializeUserSession(
    firebaseUser: FirebaseUser
  ): Promise<void> {
    // Checked once per session rather than once per retry below: the
    // result only feeds diagnostics, and a per-attempt check would
    // double-count the app_check_status event and repeat the
    // "proceeding without" log on every transient-error retry.
    const tokenCheck = appCheckTokenReady().then((tokenResult) => {
      void this.analytics.logAppCheckStatus(tokenResult);
      if (!tokenResult.ready) {
        this.analytics.logError(
          'User Service',
          'initializeAuth',
          'Proceeding without confirmed App Check token',
          tokenResult.detail
            ? `${tokenResult.reason}: ${tokenResult.detail}`
            : tokenResult.reason
        );
      }
      return tokenResult;
    });

    for (let attempt = 1; attempt <= LOGIN_SEQUENCE_MAX_ATTEMPTS; attempt++) {
      try {
        // Clear any group data left in the stores from a previous session
        this.groupStore.clearAllUserGroups();
        this.expenseStore.clearGroupExpenses();
        this.categoryStore.clearGroupCategories();
        this.memberStore.clearGroupMembers();
        this.memorizedStore.clearMemorizedExpenses();
        this.historyStore.clearHistory();
        this.splitStore.clearSplits();

        // Run the App Check readiness check and the initial user-doc
        // read concurrently instead of gating the latter on the former.
        // Firestore App Check enforcement is currently OFF (see
        // .claude/app-check-enforcement-followup.md), so waiting up to
        // appCheckTokenReady()'s 10s timeout before this Firestore read
        // buys nothing today. The check (tokenCheck, above) is still
        // awaited here so its diagnostics finish within the session.
        // WARNING: if Firestore App Check enforcement is ever re-enabled,
        // this must go back to sequential (await tokenCheck before any
        // Firestore call below) or the cold-boot race that broke new
        // registrations on 2026-08-19 will return.
        const [, existingUser] = await Promise.all([
          tokenCheck,
          this.getUserDetails(firebaseUser.uid),
        ]);

        // Brand-new account: createUserProfileOnSignUp (Cloud Function, see
        // functions/src/user-onboarding.ts) creates the doc server-side as
        // soon as the Auth account exists, independent of whether this tab
        // stays open. Wait for it via a live listener rather than creating
        // it here ourselves - client-side creation raced tab-close/
        // backgrounding and left accounts with no profile doc (see
        // .claude/orphaned-registrations-investigation.md). Falls back to
        // client-side creation only if the trigger doesn't complete within
        // the wait (rare - function outage or a slow cold start).
        const profile =
          existingUser ??
          (await this.waitForServerCreatedUser(firebaseUser.uid)) ??
          (await this.createUserIfNotExists(firebaseUser.uid));

        // Every path stores the address the same way: from a refreshed
        // token, once verified (a profile created above starts at '').
        const email = await this.#syncProfileEmail(firebaseUser, profile.email);
        const userData =
          email === profile.email ? profile : new User({ ...profile, email });

        const user = new User({
          ...userData,
          id: firebaseUser.uid,
        });
        this.userStore.initUser(
          user,
          firebaseUser.providerData[0]?.providerId === 'google.com',
          !!firebaseUser.emailVerified
        );
        await this.groupService.getUserGroups(user);
        this.#handlingSessionExpiry = false;
        return;
      } catch (error) {
        const willRetry =
          attempt < LOGIN_SEQUENCE_MAX_ATTEMPTS &&
          this.isTransientFirestoreError(error);
        if (willRetry) {
          await this.delay(LOGIN_SEQUENCE_RETRY_DELAY_MS);
          continue;
        }
        // A confirmed email change revoked the session mid-start (the
        // account-action page expects that and explains it): nothing failed
        // that the generic error would help with.
        if (this.#expectingSignOut && isRevokedSessionError(error)) {
          this.loading.loadingOff();
          return;
        }
        this.analytics.logError(
          'User Service',
          'initializeAuth',
          'Failed to initialize user',
          error instanceof Error ? error.message : 'Unknown error'
        );
        this.handleInitializeAuthFailure(error);
        return;
      }
    }
  }

  // The profile stores the sign-in address only once it is verified (Google
  // sign-ins are): invited members are linked to accounts by the profile
  // email (users.emailLower), and firestore.rules accepts a non-empty value
  // only when it is the caller's verified ID-token address. Writes that
  // address when it differs from `profileEmail`, and returns what the
  // profile now holds.
  //
  // The address written comes from a freshly refreshed ID token, not from
  // the User object captured when the session started: on the
  // account-action page the user is reloaded onto a just-confirmed address
  // mid-load, so a captured address (or a cached token) can be stale, and
  // writing it would put the old address back (seen in e2e; the rules
  // refused it). The refresh costs a request only when the live user's
  // verified address differs from the profile.
  async #syncProfileEmail(
    firebaseUser: FirebaseUser,
    profileEmail: string
  ): Promise<string> {
    const liveEmail = verifiedEmail(firebaseUser);
    if (!liveEmail || liveEmail === profileEmail) return profileEmail;

    const { claims } = await firebaseUser.getIdTokenResult(true);
    const tokenEmail =
      claims['email_verified'] === true && typeof claims['email'] === 'string'
        ? claims['email']
        : '';
    if (!tokenEmail || tokenEmail === profileEmail) return profileEmail;

    const docRef = doc(this.fs, `users/${firebaseUser.uid}`);
    await setDoc(docRef, { email: tokenEmail }, { merge: true });
    return tokenEmail;
  }

  private async initializeAuth(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
    } catch (error) {
      // Non-fatal: auth still works without persistence set, just falls
      // back to Firebase's default (in-memory) persistence for this
      // session. The auth state listener below must still be registered
      // regardless, or a persistence failure would silently prevent the
      // app from ever picking up login state.
      this.analytics.logError(
        'User Service',
        'initializeAuth',
        'Failed to set auth persistence',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    this.auth.onAuthStateChanged(async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        await this.initializeUserSession(firebaseUser);
      } else {
        // Firebase transitioned to a logged-out state. Distinguish an
        // intentional logout() call from an involuntary session loss
        // (revoked token, evicted persistence, sign-out in another tab).
        if (!this.#intentionalLogout && this.userStore.isLoggedIn()) {
          this.handleSessionExpired();
        }
        this.#intentionalLogout = false;
        this.#expectingSignOut = false;
      }
    });
  }

  // Resolves as soon as createUserProfileOnSignUp's server-side write
  // lands (near-instant push via the listener, not polling), or null
  // after timeoutMs if it never does. Callers fall back to creating the
  // doc themselves on null.
  private waitForServerCreatedUser(
    userId: string,
    timeoutMs = SERVER_USER_PROFILE_WAIT_TIMEOUT_MS
  ): Promise<User | null> {
    return new Promise((resolve) => {
      const docRef = doc(this.fs, `users/${userId}`);
      let settled = false;
      let unsubscribe: () => void = () => {};
      // Declared before the onSnapshot() call below and left possibly
      // undefined - a mocked (or otherwise synchronous) onSnapshot could
      // invoke onNext before returning, calling settle() before this
      // would otherwise be assigned.
      let timer: ReturnType<typeof setTimeout> | undefined;

      const settle = (user: User | null) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        unsubscribe();
        resolve(user);
      };

      unsubscribe = onSnapshot(
        docRef,
        (snap: DocumentSnapshot<any>) => {
          if (snap.exists()) {
            settle(
              new User({
                id: snap.id,
                ...snap.data(),
                ref: docRef as DocumentReference<User>, // NOSONAR
              })
            );
          }
        },
        (error: FirestoreError) => {
          this.analytics.logSnapshotError(
            'User Service',
            'waitForServerCreatedUser',
            'Failed to listen for server-created user profile',
            error instanceof Error ? error.message : 'Unknown error'
          );
          settle(null);
        }
      );

      if (!settled) {
        timer = setTimeout(() => settle(null), timeoutMs);
      }
    });
  }

  async getUserDetails(userId: string): Promise<User | null> {
    try {
      const docRef = doc(this.fs, `users/${userId}`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return new User({
          id: docSnap.id,
          ...docSnap.data(),
          ref: docRef as DocumentReference<User>, // NOSONAR
        });
      }
      return null;
    } catch (error) {
      this.analytics.logError(
        'User Service',
        'getUserDetails',
        'Failed to get user details',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // The fallback when createUserProfileOnSignUp hasn't created the profile.
  // It never writes an address: the doc starts at '' (always accepted by
  // the rules), and the caller then stores the verified address through
  // #syncProfileEmail, which refreshes the ID token first. Writing the
  // address here under a cached token failed for a user who had verified
  // elsewhere since signing in (the token still said unverified).
  async createUserIfNotExists(userId: string): Promise<User> {
    try {
      const existingUser = await this.getUserDetails(userId);
      if (existingUser) return existingUser;

      const docRef = doc(this.fs, `users/${userId}`);
      const defaultUserData = {
        email: '',
        defaultGroupRef: null,
        receiptPolicy: false,
        emailOptOut: false,
        venmoId: '',
        paypalId: '',
        cashAppId: '',
        zelleId: '',
      };

      await setDoc(docRef, defaultUserData);
      const userDocRef = docRef as DocumentReference<User>; // NOSONAR

      // Any invited-member records for this email get linked on the
      // Groups page's own load, not here - this runs at the exact
      // cold-boot moment most likely to race App Check's first token
      // fetch (see GroupsComponent), and groupGuard/getUserGroups
      // guarantee a groupless user lands on Groups regardless.

      return new User({
        id: userId,
        ...defaultUserData,
        ref: userDocRef,
      });
    } catch (error) {
      this.analytics.logError(
        'User Service',
        'createUserIfNotExists',
        'Failed to create user',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async updateUser(changes: Partial<User>): Promise<void> {
    try {
      const userId = this.#requireUserId();
      const docRef = doc(this.fs, `users/${userId}`);
      await setDoc(docRef, changes, { merge: true });
      this.userStore.updateUser(changes);
    } catch (error) {
      this.analytics.logError(
        'User Service',
        'updateUser',
        'Failed to update user',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // Called once `newEmail` has just been verified (or verified and made the
  // sign-in address). The cached ID token still carries the old claims, so
  // it is refreshed first: the rules accept the profile email only when it
  // matches a verified token email, and linkInvitedMembers links by the
  // token's address.
  async updateUserEmailAndLinkMembers(newEmail: string): Promise<void> {
    const userId = this.#requireUserId();
    await this.auth.currentUser!.getIdToken(true);
    // prettier-ignore
    const userDocRef = doc( // NOSONAR
      this.fs,
      `users/${userId}`
    ) as DocumentReference<User>;

    // Update the email on the user document
    await setDoc(userDocRef, { email: newEmail }, { merge: true });
    this.userStore.updateUser({ email: newEmail });

    // Link any unlinked member records with the verified address
    const membersLinked = await this.memberLinkService.linkInvitedMembers();
    if (membersLinked !== null) {
      this.analytics.logEvent('email_verified_members_linked', {
        email: newEmail,
        membersLinked,
      });
    }
  }

  async getPaymentMethods(
    memberRef: DocumentReference<Member>
  ): Promise<object> {
    try {
      const memberDoc = await getDoc(memberRef);
      if (!memberDoc.exists()) {
        return {};
      }

      const userRef = memberDoc.data()?.userRef;
      if (!userRef) {
        return {};
      }
      const userDocSnap = await getDoc(userRef);

      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        return {
          venmoId: data.venmoId ?? '',
          paypalId: data.paypalId ?? '',
          cashAppId: data.cashAppId ?? '',
          zelleId: data.zelleId ?? '',
        };
      } else {
        return {};
      }
    } catch (error) {
      this.analytics.logError(
        'User Service',
        'getPaymentMethods',
        'Failed to get payment methods',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  // Group emails are built and addressed server-side (functions/src/
  // group-emails.ts): the client sends only member ids and amounts, and the
  // server mails each recipient's linked account at its verified profile
  // address. The server takes at most GROUP_EMAIL_BATCH requests or member
  // ids per call, so longer lists go out as several calls.

  async #callSendPaymentRequests(
    groupId: string,
    requests: {
      owedByMemberRef: DocumentReference<Member>;
      owedToMemberRef: DocumentReference<Member>;
      amount: number;
    }[]
  ): Promise<PaymentRequestResult[]> {
    const fn = httpsCallable<
      {
        groupId: string;
        requests: {
          owedByMemberId: string;
          owedToMemberId: string;
          amount: number;
        }[];
      },
      { results: PaymentRequestResult[] }
    >(this.functions, 'sendPaymentRequests');
    const { data } = await fn({
      groupId,
      requests: requests.map((r) => ({
        owedByMemberId: r.owedByMemberRef.id,
        owedToMemberId: r.owedToMemberRef.id,
        amount: r.amount,
      })),
    });
    return data.results;
  }

  async sendPaymentRequestEmail(
    groupId: string,
    owedByMemberRef: DocumentReference<Member>,
    owedToMemberRef: DocumentReference<Member>,
    amount: number
  ): Promise<PaymentRequestResult> {
    const [result] = await this.#callSendPaymentRequests(groupId, [
      { owedByMemberRef, owedToMemberRef, amount },
    ]);
    return result!;
  }

  async sendGroupPaymentRequestEmails(
    groupId: string,
    transfers: {
      owedByMemberRef: DocumentReference<Member>;
      owedToMemberRef: DocumentReference<Member>;
      amount: number;
    }[]
  ): Promise<{ sent: number; skipped: number }> {
    if (transfers.length === 0) {
      return { sent: 0, skipped: 0 };
    }
    const results = (
      await Promise.all(
        inBatches(transfers).map((batch) =>
          this.#callSendPaymentRequests(groupId, batch)
        )
      )
    ).flat();
    const sent = results.filter((r) => r === 'sent').length;
    return { sent, skipped: results.length - sent };
  }

  async sendMemberPaymentUnpayEmails(
    groupId: string,
    paidByMemberRef: DocumentReference<Member>,
    paidToMemberRef: DocumentReference<Member>,
    amount: number,
    splitCount: number
  ): Promise<void> {
    const fn = httpsCallable<
      {
        groupId: string;
        paidByMemberId: string;
        paidToMemberId: string;
        amount: number;
        splitCount: number;
      },
      { sent: number }
    >(this.functions, 'sendPaymentReversalEmails');
    await fn({
      groupId,
      paidByMemberId: paidByMemberRef.id,
      paidToMemberId: paidToMemberRef.id,
      amount,
      splitCount,
    });
  }

  async sendGroupSettleUnpayEmails(
    groupId: string,
    memberRefs: DocumentReference<Member>[],
    settleDate: Date
  ): Promise<void> {
    if (memberRefs.length === 0) {
      return;
    }
    const fn = httpsCallable<
      { groupId: string; memberIds: string[]; settleDate: string },
      { sent: number }
    >(this.functions, 'sendSettleReversalEmails');
    await Promise.all(
      inBatches(memberRefs).map((batch) =>
        fn({
          groupId,
          memberIds: batch.map((ref) => ref.id),
          settleDate: toIsoFormat(settleDate),
        })
      )
    );
  }

  async logout(redirect: boolean = true): Promise<void> {
    this.#intentionalLogout = true;
    this.groupService.logout();
    await this.auth.signOut();
    this.userStore.clearUser();
    if (redirect) {
      this.router.navigate([ROUTE_PATHS.HOME]);
    }
  }
}
