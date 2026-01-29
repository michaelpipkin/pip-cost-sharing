import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { Member } from '@models/member';
import { User } from '@models/user';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import { AnalyticsService } from '@services/analytics.service';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  collectionGroup,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { DemoModeService } from './demo-mode.service';
import { GroupService } from './group.service';
import { IUserService } from './user.service.interface';

@Injectable({
  providedIn: 'root',
})
export class UserService implements IUserService {
  protected readonly fs = inject(getFirestore);
  protected readonly auth = inject(getAuth);
  private readonly analytics = inject(AnalyticsService);
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
  protected readonly demoModeService = inject(DemoModeService);

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
      this.auth.onAuthStateChanged(async (firebaseUser) => {
        if (!!firebaseUser) {
          try {
            // Clear all demo data from stores when a real user logs in
            this.groupStore.clearAllUserGroups();
            this.expenseStore.clearGroupExpenses();
            this.categoryStore.clearGroupCategories();
            this.memberStore.clearGroupMembers();
            this.memorizedStore.clearMemorizedExpenses();
            this.historyStore.clearHistory();
            this.splitStore.clearSplits();

            const userData = await this.createUserIfNotExists(
              firebaseUser.uid,
              firebaseUser.email
            );
            const user = new User({
              id: firebaseUser.uid,
              ...userData,
            });
            this.userStore.setUser(user);
            this.userStore.setIsDemoMode(false);

            this.userStore.setIsGoogleUser(
              firebaseUser.providerData[0].providerId === 'google.com'
            );
            this.userStore.setIsEmailConfirmed(!!firebaseUser.emailVerified);
            await this.groupService.getUserGroups(user);
          } catch (error) {
            this.analytics.logEvent('error', {
              message: 'Failed to initialize user',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      });
    } catch (error) {
      this.analytics.logEvent('error', {
        message: 'Failed to set auth persistence',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getUserDetails(userId: string): Promise<User | null> {
    try {
      const docRef = doc(this.fs, `users/${userId}`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return new User({
          id: docSnap.id,
          ...docSnap.data(),
          ref: docRef as DocumentReference<User>,
        });
      }
      return null;
    } catch (error) {
      this.analytics.logEvent('error', {
        message: 'Failed to get user details',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
        venmoId: '',
        paypalId: '',
        cashAppId: '',
        zelleId: '',
      };

      await setDoc(docRef, defaultUserData);
      const userDocRef = docRef as DocumentReference<User>;

      // Link any unlinked member records with this email to the new user
      const membersQuery = query(
        collectionGroup(this.fs, 'members'),
        where('email', '==', email),
        where('userRef', '==', null)
      );
      const membersSnapshot = await getDocs(membersQuery);

      for (const memberDoc of membersSnapshot.docs) {
        await updateDoc(memberDoc.ref, { userRef: userDocRef });
      }

      if (membersSnapshot.size > 0) {
        this.analytics.logEvent('new_user_members_linked', {
          email: email,
          membersLinked: membersSnapshot.size,
        });
      }

      return new User({
        id: userId,
        ...defaultUserData,
        ref: userDocRef,
      });
    } catch (error) {
      this.analytics.logEvent('error', {
        message: 'Failed to create user',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateUser(changes: Partial<User>): Promise<void> {
    try {
      const userId = this.userStore.user().id;
      const docRef = doc(this.fs, `users/${userId}`);
      await setDoc(docRef, changes, { merge: true });
      this.userStore.updateUser(changes);
    } catch (error) {
      this.analytics.logEvent('error', {
        message: 'Failed to update user',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateUserEmailAndLinkMembers(newEmail: string): Promise<void> {
    try {
      const userId = this.userStore.user().id;
      const userDocRef = doc(
        this.fs,
        `users/${userId}`
      ) as DocumentReference<User>;

      // Update the email on the user document
      await setDoc(userDocRef, { email: newEmail }, { merge: true });
      this.userStore.updateUser({ email: newEmail });

      // Query members collection group for unlinked members with this email
      const membersQuery = query(
        collectionGroup(this.fs, 'members'),
        where('email', '==', newEmail),
        where('userRef', '==', null)
      );
      const membersSnapshot = await getDocs(membersQuery);

      // Link each matching member to this user
      for (const memberDoc of membersSnapshot.docs) {
        await updateDoc(memberDoc.ref, { userRef: userDocRef });
      }

      this.analytics.logEvent('email_verified_members_linked', {
        email: newEmail,
        membersLinked: membersSnapshot.size,
      });
    } catch (error) {
      this.analytics.logEvent('error', {
        message: 'Failed to update user email and link members',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
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

      const userRef = memberDoc.data().userRef;
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
      this.analytics.logEvent('error', {
        message: 'Failed to get payment methods',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async logout(redirect: boolean = true): Promise<void> {
    await this.auth.signOut();
    this.groupService.logout();
    this.userStore.clearUser();
    if (redirect) {
      this.router.navigate([ROUTE_PATHS.HOME]);
    }
  }
}
