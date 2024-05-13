import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { MatIconButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import * as firebase from 'firebase/auth';
import { catchError, Observable, tap, throwError } from 'rxjs';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MatError,
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatOption,
    MatLabel,
    MatSelect,
    MatInput,
    CommonModule,
    MatError,
    MatIconButton,
    MatSuffix,
    MatIcon,
  ],
})
export class ProfileComponent implements OnInit {
  groups$: Observable<Group[]>;
  emailForm: FormGroup;
  passwordForm: FormGroup;
  defaultGroupForm: FormGroup;
  selectedGroupId: string = '';
  currentUser: firebase.User;
  hidePassword: boolean = true;
  hideConfirm: boolean = true;

  constructor(
    private userSerivce: UserService,
    private groupService: GroupService,
    private fb: FormBuilder,
    private loading: LoadingService,
    private snackBar: MatSnackBar,
    private analytics: AngularFireAnalytics,
    private afAuth: AngularFireAuth
  ) {
    this.emailForm = this.fb.group({
      email: ['', Validators.email],
    });
    this.passwordForm = this.fb.group(
      {
        password: '',
        confirmPassword: '',
      },
      { validators: this.passwordMatchValidator }
    );
    this.afAuth.currentUser.then((user) => {
      this.currentUser = user;
      this.emailForm.patchValue({ email: user.email });
      this.loadGroups();
    });
  }

  loadGroups(): void {
    this.loading.loadingOn();
    this.groups$ = this.groupService
      .getGroupsForUser(this.currentUser.uid)
      .pipe(
        tap(() => {
          const defaultGroupId = this.userSerivce.getDefaultGroupId();
          if (defaultGroupId !== null) {
            this.selectedGroupId = defaultGroupId;
          }
          this.loading.loadingOff();
        })
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

  saveDefaultGroup(): void {
    this.userSerivce
      .saveDefaultGroup(this.selectedGroupId)
      .pipe(
        tap(() => {
          this.snackBar.open('Default group updated.', 'Close');
        }),
        catchError((err: Error) => {
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'edit_group',
            message: err.message,
          });
          this.snackBar.open(
            'Something went wrong - could not update default group.',
            'Close'
          );
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
  }
}
