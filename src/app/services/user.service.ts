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

  constructor() {
    afterNextRender(async () => {
      await this.initializeAuth();
    });
  }

  private handleSessionExpired(): void {
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
    const email = firebaseUser.email!;

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

        let userData: User;
        if (existingUser) {
          userData = existingUser;
          if (existingUser.email !== email) {
            const docRef = doc(this.fs, `users/${firebaseUser.uid}`);
            await setDoc(docRef, { email }, { merge: true });
            userData = new User({ ...existingUser, email });
          }
        } else {
          // Brand-new account: createUserProfileOnSignUp (Cloud
          // Function, see functions/src/user-onboarding.ts) creates the
          // doc server-side as soon as the Auth account exists,
          // independent of whether this tab stays open. Wait for it via
          // a live listener rather than creating it here ourselves -
          // client-side creation raced tab-close/backgrounding and left
          // accounts with no profile doc (see
          // .claude/orphaned-registrations-investigation.md). Falls
          // back to the old client-side creation only if the trigger
          // doesn't complete within the wait (rare - function outage or
          // a slow cold start).
          userData =
            (await this.waitForServerCreatedUser(firebaseUser.uid)) ??
            (await this.createUserIfNotExists(firebaseUser.uid, email));
        }

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

  async createUserIfNotExists(userId: string, email: string): Promise<User> {
    try {
      const existingUser = await this.getUserDetails(userId);
      if (existingUser) {
        if (existingUser.email !== email) {
          const docRef = doc(this.fs, `users/${userId}`);
          await setDoc(docRef, { email }, { merge: true });
          existingUser.email = email;
        }
        return existingUser;
      }

      const docRef = doc(this.fs, `users/${userId}`);
      const defaultUserData = {
        email: email,
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

  async updateUserEmailAndLinkMembers(newEmail: string): Promise<void> {
    const userId = this.#requireUserId();
    // prettier-ignore
    const userDocRef = doc( // NOSONAR
      this.fs,
      `users/${userId}`
    ) as DocumentReference<User>;

    // Update the email on the user document
    await setDoc(userDocRef, { email: newEmail }, { merge: true });
    this.userStore.updateUser({ email: newEmail });

    // Link any unlinked member records with this email to this user
    const membersLinked =
      await this.memberLinkService.linkInvitedMembers(newEmail);
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
  // server reads each recipient's address from their member doc.

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
    const results = await this.#callSendPaymentRequests(groupId, transfers);
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
    await fn({
      groupId,
      memberIds: memberRefs.map((ref) => ref.id),
      settleDate: toIsoFormat(settleDate),
    });
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
