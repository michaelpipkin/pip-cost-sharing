import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@models/user';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { GroupService } from './group.service';
import { IUserService } from './user.service.interface';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';

@Injectable({
  providedIn: 'root',
})
export class UserService implements IUserService {
  fs = inject(getFirestore);
  auth = inject(getAuth);
  analytics = inject(getAnalytics);
  router = inject(Router);
  userStore = inject(UserStore);
  groupService = inject(GroupService);

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
      return new User(docSnap.data());
    } else {
      setDoc(docRef, {
        defaultGroupId: '',
        venmoId: '',
        paypalId: '',
        cashAppId: '',
        zelleId: '',
      });
      return null;
    }
  }

  async saveDefaultGroup(groupId: string): Promise<void> {
    const userId = this.userStore.user().id;
    const docRef = doc(this.fs, `users/${userId}`);
    return await setDoc(
      docRef,
      {
        defaultGroupId: groupId,
      },
      { merge: true }
    ).then(() => {
      this.userStore.updateUser({ defaultGroupId: groupId });
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
}
