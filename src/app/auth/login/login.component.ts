import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import firebase from 'firebase/compat/app';
import * as firebaseui from 'firebaseui';
import EmailAuthProvider = firebase.auth.EmailAuthProvider;
import GoogleAuthProvider = firebase.auth.GoogleAuthProvider;

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  ui: firebaseui.auth.AuthUI;

  constructor(private afAuth: AngularFireAuth, private router: Router) {}

  ngOnInit(): void {
    this.afAuth.app.then((app) => {
      const uiConfig = {
        signInOptions: [
          {
            provider: EmailAuthProvider.PROVIDER_ID,
            requireDisplayName: false,
          },
          {
            provider: GoogleAuthProvider.PROVIDER_ID,
            requireDisplayName: false,
          },
        ],
        callbacks: {
          signInSuccessWithAuthResult: this.onLoginSuccess.bind(this),
        },
      };
      this.ui = new firebaseui.auth.AuthUI(app.auth());
      this.ui.start('#firebaseui-auth-container', uiConfig);
      this.ui.disableAutoSignIn();
    });
  }

  ngOnDestroy(): void {
    this.ui.delete();
  }

  onLoginSuccess() {
    this.router.navigateByUrl('/members');
  }
}
