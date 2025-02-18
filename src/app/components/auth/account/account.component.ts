import {
  Component,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { environment } from '@env/environment';
import { Group } from '@models/group';
import { User } from '@models/user';
import { ExpenseService } from '@services/expense.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import * as firebase from 'firebase/auth';
import { getAuth } from 'firebase/auth';

@Component({
  selector: 'app-account',
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatOptionModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
  ],
})
export class AccountComponent {
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(getAnalytics);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly splitService = inject(SplitService);
  protected readonly expenseService = inject(ExpenseService);

  #user: Signal<User> = this.userStore.user;
  activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;
  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;

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
  paymentsForm = this.fb.group({
    venmoId: [this.#user()?.venmoId],
    paypalId: [this.#user()?.paypalId],
    cashAppId: [this.#user()?.cashAppId],
    zelleId: [this.#user()?.zelleId],
  });

  constructor() {
    effect(() => {
      this.selectedGroupId.set(this.#user()?.defaultGroupId ?? '');
      this.groupForm.patchValue({ groupId: this.#user()?.defaultGroupId });
      this.emailForm.patchValue({ email: this.#user()?.email });
      this.paymentsForm.patchValue({
        venmoId: this.#user()?.venmoId,
        paypalId: this.#user()?.paypalId,
        cashAppId: this.#user()?.cashAppId,
        zelleId: this.#user()?.zelleId,
      });
    });
  }

  get e() {
    return this.emailForm.controls;
  }

  get g() {
    return this.groupForm.controls;
  }

  get p() {
    return this.paymentsForm.controls;
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

  onSubmitPayments(): void {
    this.loading.loadingOn();
    this.paymentsForm.disable();
    const changes = this.paymentsForm.value;
    this.userService
      .updateUser({
        venmoId: changes.venmoId,
        paypalId: changes.paypalId,
        cashAppId: changes.cashAppId,
        zelleId: changes.zelleId,
      })
      .then(() => {
        this.snackBar.open('Payment service IDs updated.', 'OK');
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'update_payments',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - your payment service IDs could not be updated.',
          'OK'
        );
      })
      .finally(() => {
        this.paymentsForm.enable();
        this.loading.loadingOff();
      });
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

  fixExpenses(): void {
    this.loading.loadingOn();
    this.expenseService
      .updateAllExpensesPaidStatus()
      .then(() => {
        this.loading.loadingOff();
        this.snackBar.open('Expenses updated.', 'Close');
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'fix_expenses',
          message: err.message,
        });
        this.loading.loadingOff();
        this.snackBar.open(
          'Something went wrong - could not update expenses.',
          'Close'
        );
      });
  }
}
