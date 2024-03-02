import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as firebase from 'firebase/auth';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  emailForm: FormGroup;
  passwordForm: FormGroup;
  currentUser: firebase.User;
  hidePassword: boolean = true;
  hideConfirm: boolean = true;

  constructor(
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private afAuth: AngularFireAuth
  ) {
    this.afAuth.currentUser.then((user) => {
      this.currentUser = user;
      this.emailForm = this.fb.group({
        email: [user.email, Validators.email],
      });
    });
    this.passwordForm = this.fb.group(
      {
        password: '',
        confirmPassword: '',
      },
      { validators: this.passwordMatchValidator }
    );
  }

  get fEmail() {
    return this.emailForm.controls;
  }

  get fPass() {
    return this.passwordForm.controls;
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password').value === g.get('confirmPassword').value
      ? null
      : { mismatch: true };
  }

  ngOnInit(): void {}

  verifyEmail(): void {
    firebase
      .sendEmailVerification(this.currentUser)
      .then(() => {
        this.snackBar.open(
          'Check your email to verify your email address.',
          'Close',
          {
            verticalPosition: 'top',
          }
        );
      })
      .catch((err: Error) => {
        console.log(err);
        this.snackBar.open(
          'Something went wrong - verification email could not be sent.',
          'Close',
          {
            verticalPosition: 'top',
          }
        );
      });
  }

  onSubmitEmail(): void {
    this.emailForm.disable();
    const newEmail = this.emailForm.value.email;
    if (newEmail !== this.currentUser.email) {
      firebase
        .updateEmail(this.currentUser, newEmail)
        .then(() => {
          this.snackBar.open('Your email address has been updated.', 'Close', {
            verticalPosition: 'top',
          });
        })
        .catch((err: Error) => {
          console.log(err);
          this.snackBar.open(
            'Something went wrong - your email address could not be updated.',
            'Close',
            {
              verticalPosition: 'top',
            }
          );
        });
    }
    this.emailForm.enable();
  }

  onSubmitPassword(): void {
    this.passwordForm.disable();
    const changes = this.passwordForm.value;
    if (changes.password !== '') {
      firebase
        .updatePassword(this.currentUser, changes.password)
        .then(() => {
          this.snackBar.open('Your password has been updated.', 'Close', {
            verticalPosition: 'top',
          });
        })
        .catch(() => {
          this.snackBar.open(
            'Something went wrong - your password could not be updated.',
            'Close',
            {
              verticalPosition: 'top',
            }
          );
        });
    }
    this.passwordForm.enable();
  }
}
