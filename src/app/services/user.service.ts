import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { User } from '@models/user';
import { BehaviorSubject, map, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private userSubject = new BehaviorSubject<User>(null);
  isLoggedIn$: Observable<boolean>;

  constructor(private afAuth: AngularFireAuth, private router: Router) {
    this.isLoggedIn$ = afAuth.authState.pipe(
      map((user) => {
        if (!!user) {
          this.userSubject.next(
            new User({
              id: user.uid,
              email: user.email,
            })
          );
          return true;
        }
        return false;
      })
    );
  }

  logout() {
    this.afAuth.signOut().finally(() => this.router.navigateByUrl('/login'));
  }

  getCurrentUser = (): User => this.userSubject.getValue();
}
