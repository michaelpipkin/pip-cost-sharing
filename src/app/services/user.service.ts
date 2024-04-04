import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import firebase from 'firebase/compat/app';
import { BehaviorSubject, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private userSubject = new BehaviorSubject<firebase.User>(null);
  isLoggedIn$: Observable<boolean>;

  constructor(private afAuth: AngularFireAuth, private router: Router) {
    this.isLoggedIn$ = afAuth.authState.pipe(
      map((user) => {
        if (!!user) {
          this.userSubject.next(user);
          return true;
        } else {
          this.userSubject.next(null);
          return false;
        }
      })
    );
  }

  logout() {
    this.afAuth.signOut().finally(() => this.router.navigateByUrl('/home'));
  }

  getCurrentUser = (): firebase.User => this.userSubject.getValue();
}
