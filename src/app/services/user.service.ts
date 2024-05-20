import { inject, Injectable, signal } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { doc, Firestore, getDoc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Group } from '@models/group';
import { User } from '@models/user';
import { LoadingService } from '@shared/loading/loading.service';
import { Observable } from 'rxjs';
import { GroupService } from './group.service';
import { MemberService } from './member.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  user = signal<User>(null);
  isLoggedIn = signal<boolean>(false);

  fs = inject(Firestore);
  router = inject(Router);
  afAuth = inject(AngularFireAuth);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  loading = inject(LoadingService);

  isLoggedIn$: Observable<boolean>;

  constructor() {
    this.afAuth.onAuthStateChanged((firebaseUser) => {
      if (!!firebaseUser) {
        this.isLoggedIn.set(true);
        this.loading.loadingOn();
        this.getDefaultGroup(firebaseUser.uid)
          .then((groupId: string) => {
            const user = new User({
              id: firebaseUser.uid,
              email: firebaseUser.email,
              defaultGroupId: groupId,
            });
            this.user.set(user);
            return user;
          })
          .then((user: User) => {
            this.groupService.getUserGroups(user.id).then(() => {
              const activeUserGroups: Group[] =
                this.groupService.activeUserGroups();
              if (activeUserGroups.length === 1) {
                this.memberService
                  .getMemberByUserId(activeUserGroups[0].id, user.id)
                  .then(
                    async () =>
                      await this.groupService
                        .getGroupById(activeUserGroups[0].id)
                        .then(() => {
                          this.loading.loadingOff();
                          this.router.navigateByUrl('/groups');
                        })
                  );
              } else if (user.defaultGroupId !== '') {
                this.memberService
                  .getMemberByUserId(user.defaultGroupId, user.id)
                  .then(
                    async () =>
                      await this.groupService
                        .getGroupById(user.defaultGroupId)
                        .then(() => {
                          this.loading.loadingOff();
                          this.router.navigateByUrl('/groups');
                        })
                  );
              } else {
                this.loading.loadingOff();
                this.router.navigateByUrl('/groups');
              }
            });
          });
        return true;
      } else {
        this.user.set(null);
        this.isLoggedIn.set(false);
        this.loading.loadingOff();
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
    this.afAuth.signOut().finally(() => this.router.navigateByUrl('/home'));
  }
}
