import { inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { doc, Firestore, getDoc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { User } from '@models/user';
import { GroupService } from './group.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  user = signal<User>(null);
  isLoggedIn = signal<boolean>(false);

  fs = inject(Firestore);
  router = inject(Router);
  auth = inject(Auth);
  groupService = inject(GroupService);

  constructor() {
    this.auth.onAuthStateChanged((firebaseUser) => {
      if (!!firebaseUser) {
        this.isLoggedIn.set(true);
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
        this.isLoggedIn.set(false);
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
    this.auth.signOut().finally(() => this.router.navigateByUrl('/home'));
  }
}
