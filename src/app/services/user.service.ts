import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { GroupService } from './group.service';
import { IUserService } from './user.service.interface';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  doc,
  DocumentReference,
  getDoc,
  getFirestore,
  setDoc,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class UserService implements IUserService {
  protected readonly fs = inject(getFirestore);
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(getAnalytics);
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly groupService = inject(GroupService);

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
      this.auth.onAuthStateChanged(async (firebaseUser) => {
        if (!!firebaseUser) {
          try {
            const userData = await this.createUserIfNotExists(firebaseUser.uid);
            const user = new User({
              id: firebaseUser.uid,
              email: firebaseUser.email,
              ...userData,
            });
            this.userStore.setUser(user);
            this.userStore.setIsGoogleUser(
              firebaseUser.providerData[0].providerId === 'google.com'
            );
            await this.groupService.getUserGroups(user, true);
          } catch (error) {
            logEvent(this.analytics, 'error', { 
              message: 'Failed to initialize user', 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        } else {
          this.userStore.clearUser();
          this.groupService.logout();
        }
      });
    } catch (error) {
      logEvent(this.analytics, 'error', { 
        message: 'Failed to set auth persistence',
        error: error instanceof Error ? error.message : 'Unknown error'
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
      logEvent(this.analytics, 'error', { 
        message: 'Failed to get user details',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async createUserIfNotExists(userId: string): Promise<User> {
    try {
      const existingUser = await this.getUserDetails(userId);
      if (existingUser) {
        return existingUser;
      }

      const docRef = doc(this.fs, `users/${userId}`);
      const defaultUserData = {
        defaultGroupRef: null,
        venmoId: '',
        paypalId: '',
        cashAppId: '',
        zelleId: '',
      };
      
      await setDoc(docRef, defaultUserData);
      return new User({
        id: userId,
        ...defaultUserData,
        ref: docRef as DocumentReference<User>,
      });
    } catch (error) {
      logEvent(this.analytics, 'error', { 
        message: 'Failed to create user',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async saveDefaultGroup(groupRef: DocumentReference<Group>): Promise<void> {
    try {
      const userId = this.userStore.user().id;
      const docRef = doc(this.fs, `users/${userId}`);
      await setDoc(
        docRef,
        {
          defaultGroupRef: groupRef,
        },
        { merge: true }
      );
      this.userStore.updateUser({ defaultGroupRef: groupRef });
    } catch (error) {
      logEvent(this.analytics, 'error', { 
        message: 'Failed to save default group',
        error: error instanceof Error ? error.message : 'Unknown error'
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
      logEvent(this.analytics, 'error', { 
        message: 'Failed to update user',
        error: error instanceof Error ? error.message : 'Unknown error'
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
      logEvent(this.analytics, 'error', { 
        message: 'Failed to get payment methods',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  logout(): void {
    this.groupService.logout();
    this.auth.signOut().finally(() => this.router.navigateByUrl('/home'));
  }

  // Migration method to update groupId to groupRef in user documents

  // async migrateGroupIdsToRefs(): Promise<boolean | Error> {
  //   const batch = writeBatch(this.fs);

  //   try {
  //     // Query all user documents
  //     const usersCollection = collectionGroup(this.fs, 'users');
  //     const userDocs = await getDocs(usersCollection);

  //     for (const userDoc of userDocs.docs) {
  //       const userData = userDoc.data();

  //       // Skip if already migrated (no groupId or groupRef already exists)
  //       if (!userData.defaultGroupId || userData.defaultGroupRef) {
  //         continue;
  //       }

  //       // Create the group document reference
  //       const groupRef = doc(this.fs, `groups/${userData.defaultGroupId}`);

  //       // Update the document: add groupRef and remove groupId
  //       batch.update(userDoc.ref, {
  //         defaultGroupRef: groupRef,
  //         defaultGroupId: deleteField(), // This removes the field
  //       });
  //     }

  //     return await batch
  //       .commit()
  //       .then(() => {
  //         console.log('Successfully migrated all user documents');
  //         return true;
  //       })
  //       .catch((err: Error) => {
  //         console.error('Error migrating user documents:', err);
  //         return new Error(err.message);
  //       });
  //   } catch (error) {
  //     console.error('Error during migration:', error);
  //     return new Error(
  //       error instanceof Error ? error.message : 'Unknown error occurred'
  //     );
  //   }
  // }
}
