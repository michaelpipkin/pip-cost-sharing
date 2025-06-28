import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Group } from '@models/group';
import { User } from '@models/user';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  collectionGroup,
  deleteField,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { GroupService } from './group.service';
import { IUserService } from './user.service.interface';

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
    setPersistence(this.auth, browserLocalPersistence)
      .then(async () => {
        this.auth.onAuthStateChanged((firebaseUser) => {
          if (!!firebaseUser) {
            this.getUserDetails(firebaseUser.uid).then(
              async (userData: Partial<User>) => {
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
              }
            );
            return true;
          } else {
            this.userStore.clearUser();
            this.groupService.logout();
            return false;
          }
        });
      })
      .catch((error) => {
        console.error('Error setting persistence', error);
        logEvent(this.analytics, 'error', { message: error.message });
      });
  }

  async getUserDetails(userId: string): Promise<User | null> {
    const docRef = doc(this.fs, `users/${userId}`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return new User({
        id: docSnap.id,
        ...docSnap.data(),
        ref: docRef as DocumentReference<User>,
      });
    } else {
      setDoc(docRef, {
        defaultGroupRef: null,
        venmoId: '',
        paypalId: '',
        cashAppId: '',
        zelleId: '',
      });
      return null;
    }
  }

  async saveDefaultGroup(groupRef: DocumentReference<Group>): Promise<void> {
    const userId = this.userStore.user().id;
    const docRef = doc(this.fs, `users/${userId}`);
    return await setDoc(
      docRef,
      {
        defaultGroupRef: groupRef,
      },
      { merge: true }
    ).then(() => {
      this.userStore.updateUser({ defaultGroupRef: groupRef });
    });
  }

  async updateUser(changes: Partial<User>): Promise<void> {
    const userId = this.userStore.user().id;
    const docRef = doc(this.fs, `users/${userId}`);
    return await setDoc(docRef, changes, { merge: true }).then(() => {
      this.userStore.updateUser(changes);
    });
  }

  async getPaymentMethods(groupId: string, memberId: string): Promise<object> {
    const memberDocRef = doc(this.fs, `groups/${groupId}/members/${memberId}`);
    return await getDoc(memberDocRef).then(async (memberDoc) => {
      const userId = memberDoc.data().userId;
      const userDocRef = doc(this.fs, `users/${userId}`);
      const userDocSnap = await getDoc(userDocRef);
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
    });
  }

  logout(): void {
    this.groupService.logout();
    this.auth.signOut().finally(() => this.router.navigateByUrl('/home'));
  }

  async migrateGroupIdsToRefs(): Promise<boolean | Error> {
    const batch = writeBatch(this.fs);

    try {
      // Query all user documents
      const usersCollection = collectionGroup(this.fs, 'users');
      const userDocs = await getDocs(usersCollection);

      for (const userDoc of userDocs.docs) {
        const userData = userDoc.data();

        // Skip if already migrated (no groupId or groupRef already exists)
        if (!userData.defaultGroupId || userData.defaultGroupRef) {
          continue;
        }

        // Create the group document reference
        const groupRef = doc(this.fs, `groups/${userData.defaultGroupId}}`);

        // Update the document: add groupRef and remove groupId
        batch.update(userDoc.ref, {
          defaultGroupRef: groupRef,
          defaultGroupId: deleteField(), // This removes the field
        });
      }

      return await batch
        .commit()
        .then(() => {
          console.log('Successfully migrated all user documents');
          return true;
        })
        .catch((err: Error) => {
          console.error('Error migrating user documents:', err);
          return new Error(err.message);
        });
    } catch (error) {
      console.error('Error during migration:', error);
      return new Error(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
