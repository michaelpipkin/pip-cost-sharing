import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, Signal } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { MatIconButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import * as firebase from 'firebase/auth';
import { Observable, throwError } from 'rxjs';
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
  fb = inject(FormBuilder);
  afAuth = inject(AngularFireAuth);
  userService = inject(UserService);
  groupService = inject(GroupService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  analytics = inject(AngularFireAnalytics);

  user: Signal<User> = this.userService.user;
  firebaseUser: firebase.User;
  userGroups: Signal<Group[]> = this.groupService.activeUserGroups;

  emailForm = this.fb.group({
    email: [this.user().email, Validators.email],
  });
  passwordForm = this.fb.group(
    {
      password: '',
      confirmPassword: '',
    },
    { validators: this.passwordMatchValidator }
  );

  groups$: Observable<Group[]>;
  defaultGroupForm: FormGroup;
  selectedGroupId: string = '';
  hidePassword: boolean = true;
  hideConfirm: boolean = true;

  async ngOnInit(): Promise<void> {
    this.firebaseUser = await this.afAuth.currentUser;
    if (this.user().defaultGroupId !== '') {
      this.selectedGroupId = this.user().defaultGroupId;
    } else {
      this.selectedGroupId = null;
    }
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

  async verifyEmail(): Promise<void> {
    firebase
      .sendEmailVerification(this.firebaseUser)
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
    if (newEmail !== this.firebaseUser.email) {
      firebase
        .updateEmail(this.firebaseUser, newEmail)
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
        .updatePassword(this.firebaseUser, changes.password)
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
    if (this.selectedGroupId !== null && this.selectedGroupId !== '') {
      this.userService
        .saveDefaultGroup(this.selectedGroupId)
        .then(() => {
          this.snackBar.open('Default group updated.', 'Close');
        })
        .catch((err: Error) => {
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
        });
    }
  }
}
