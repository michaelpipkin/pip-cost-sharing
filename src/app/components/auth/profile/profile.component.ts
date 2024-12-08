import { Component, inject, model, signal, Signal } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { Auth } from '@angular/fire/auth';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { User } from '@models/user';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import * as firebase from 'firebase/auth';
import { environment } from 'src/environments/environment';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

@Component({
    selector: 'app-profile',
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss'],
    imports: [
        FormsModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatOptionModule,
        MatSelectModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
    ]
})
export class ProfileComponent {
  fb = inject(FormBuilder);
  auth = inject(Auth);
  userService = inject(UserService);
  groupService = inject(GroupService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  analytics = inject(Analytics);
  splitService = inject(SplitService);
  expenseService = inject(ExpenseService);

  #user: Signal<User> = this.userService.user;
  activeUserGroups: Signal<Group[]> = this.groupService.activeUserGroups;

  firebaseUser = signal<firebase.User>(this.auth.currentUser);
  prod = signal<boolean>(environment.production);

  selectedGroupId = model<string>(this.#user()?.defaultGroupId ?? '');
  hidePassword = model<boolean>(true);
  hideConfirm = model<boolean>(true);

  emailForm = this.fb.group({
    email: [this.#user()?.email, Validators.email],
  });
  passwordForm = this.fb.group(
    {
      password: '',
      confirmPassword: '',
    },
    { validators: this.passwordMatchValidator }
  );
  groupForm = this.fb.group({
    groupId: [this.#user()?.defaultGroupId],
  });

  get e() {
    return this.emailForm.controls;
  }

  get g() {
    return this.groupForm.controls;
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirm() {
    this.hideConfirm.update((h) => !h);
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password').value === g.get('confirmPassword').value
      ? null
      : { mismatch: true };
  }

  async verifyEmail(): Promise<void> {
    firebase
      .sendEmailVerification(this.firebaseUser())
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
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'verify_email',
          message: err.message,
        });
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
    if (newEmail !== this.firebaseUser().email) {
      firebase
        .updateEmail(this.firebaseUser(), newEmail)
        .then(() => {
          this.snackBar.open('Your email address has been updated.', 'Close', {
            verticalPosition: 'top',
          });
        })
        .catch((err) => {
          logEvent(this.analytics, 'error', {
            component: this.constructor.name,
            action: 'update_email',
            message: err.message,
          });
          if (err.code === 'auth/email-already-in-use') {
            this.snackBar.open(
              'This email address is already in use by another account.',
              'Close',
              {
                verticalPosition: 'top',
              }
            );
          } else {
            this.snackBar.open(
              'Something went wrong - your email address could not be updated.',
              'Close',
              {
                verticalPosition: 'top',
              }
            );
          }
        });
    }
    this.emailForm.enable();
  }

  onSubmitPassword(): void {
    this.passwordForm.disable();
    const changes = this.passwordForm.value;
    if (changes.password !== '') {
      firebase
        .updatePassword(this.firebaseUser(), changes.password)
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
    const selectedGroupId = this.groupForm.value.groupId;
    if (selectedGroupId !== null && selectedGroupId !== '') {
      this.userService
        .saveDefaultGroup(selectedGroupId)
        .then(() => {
          this.snackBar.open('Default group updated.', 'Close');
        })
        .catch((err: Error) => {
          logEvent(this.analytics, 'error', {
            component: this.constructor.name,
            action: 'edit_group',
            message: err.message,
          });
          this.snackBar.open(
            'Something went wrong - could not update default group.',
            'Close'
          );
        });
    }
  }
}
