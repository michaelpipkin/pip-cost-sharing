import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@models/user';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { GroupService } from './group.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  user = signal<User>(null);
  isLoggedIn = computed(() => !!this.user());

  fs = inject(getFirestore);
  auth = inject(getAuth);
  router = inject(Router);
  groupService = inject(GroupService);

  constructor() {
    this.auth.onAuthStateChanged((firebaseUser) => {
      if (!!firebaseUser) {
        this.getDefaultGroup(firebaseUser.uid).then(async (groupId: string) => {
          const user = new User({
            id: firebaseUser.uid,
            email: firebaseUser.email,
            defaultGroupId: groupId,
          });
          this.user.set(user);
          await this.groupService.getUserGroups(user, true);
        });
        return true;
      } else {
        this.user.set(null);
        return false;
      }
    });
  }

  async getDefaultGroup(userId: string): Promise<string> {
    const docRef = doc(this.fs, `users/${userId}`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().defaultGroupId;
    } else {
      setDoc(docRef, {
        defaultGroupId: '',
      });
      return '';
    }
  }

  async saveDefaultGroup(groupId: string): Promise<void> {
    this.user.update((u) => ({
      ...u,
      defaultGroupId: groupId,
    }));
    const docRef = doc(this.fs, `users/${this.user().id}`);
    return await setDoc(
      docRef,
      {
        defaultGroupId: groupId,
      },
      { merge: true }
    );
  }

  logout() {
    this.groupService.logout();
    this.auth.signOut().finally(() => this.router.navigateByUrl('/home'));
  }
}
