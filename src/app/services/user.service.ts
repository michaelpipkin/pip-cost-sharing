import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { UserData } from '@models/user-info';
import firebase from 'firebase/compat/app';
import { updateDoc } from 'firebase/firestore';
import { BehaviorSubject, map, Observable, of, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private userSubject = new BehaviorSubject<firebase.User>(null);
  private defaultGroupIdSubject = new BehaviorSubject<string>(null);
  isLoggedIn$: Observable<boolean>;

  constructor(
    private afAuth: AngularFireAuth,
    private db: AngularFirestore,
    private router: Router
  ) {
    this.isLoggedIn$ = afAuth.authState.pipe(
      map((user) => {
        if (!!user) {
          this.userSubject.next(user);
          this.db
            .doc(`users/${user.uid}`)
            .get()
            .pipe(
              tap((docSnap) => {
                if (docSnap.exists) {
                  const userData: UserData = docSnap.data() as UserData;
                  this.defaultGroupIdSubject.next(userData.defaultGroupId);
                }
              })
            )
            .subscribe();
          return true;
        } else {
          this.userSubject.next(null);
          return false;
        }
      })
    );
  }

  saveDefaultGroup(groupId: string): Observable<any> {
    const docRef = this.db.doc(`users/${this.userSubject.getValue().uid}`).ref;
    return of(
      updateDoc(docRef, {
        defaultGroupId: groupId,
      })
    );
  }

  createUserData(): void {
    const uid = this.userSubject.getValue().uid;
    const docRef = this.db.doc(`users/${uid}`);
    docRef
      .get()
      .pipe(
        tap((doc) => {
          if (!doc.exists) {
            docRef.set({ defaultGroupId: '' });
          }
        })
      )
      .subscribe();
  }

  logout() {
    this.afAuth.signOut().finally(() => this.router.navigateByUrl('/home'));
  }

  getCurrentUser = (): firebase.User => this.userSubject.getValue();

  getDefaultGroupId = (): string => this.defaultGroupIdSubject.getValue();
}
