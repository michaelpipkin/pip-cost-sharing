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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { environment } from '@env/environment';
import { Group } from '@models/group';
import { User } from '@models/user';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { HistoryService } from '@services/history.service';
import { MemberService } from '@services/member.service';
import { MemorizedService } from '@services/memorized.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  User as FirebaseUser,
  getAuth,
  sendEmailVerification,
  updateEmail,
  updatePassword,
} from 'firebase/auth';
import { DocumentReference } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

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
    MatCheckboxModule,
    MatIconModule,
    MatTabsModule,
    RouterLink,
  ],
})
export class AccountComponent {
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(getAnalytics);
  protected readonly functions = inject(getFunctions);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly groupService = inject(GroupService);
  protected readonly splitService = inject(SplitService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly memberService = inject(MemberService);
  protected readonly historyService = inject(HistoryService);

  user: Signal<User> = this.userStore.user;
  currentUser: Signal<User> = this.userStore.user;
  activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;
  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;
  isEmailConfirmed: Signal<boolean> = this.userStore.isEmailConfirmed;
  isValidUser: Signal<boolean> = this.userStore.isValidUser;

  firebaseUser = signal<FirebaseUser>(this.auth.currentUser);
  prod = signal<boolean>(environment.production);
  isLocalEnvironment = signal<boolean>(!environment.production);
  isLiveData = signal<boolean>(!environment.useEmulators);

  selectedGroup = model<DocumentReference | null>(
    this.currentUser()?.defaultGroupRef ?? null
  );
  hidePassword = model<boolean>(true);
  hideConfirm = model<boolean>(true);
  receiptPolicyAcknowledged = model<boolean>(false);

  emailForm = this.fb.group({
    email: [this.currentUser()?.email, Validators.email],
  });
  passwordForm = this.fb.group(
    {
      password: '',
      confirmPassword: '',
    },
    { validators: this.passwordMatchValidator }
  );
  groupForm = this.fb.group({
    groupRef: [this.currentUser()?.defaultGroupRef],
  });
  paymentsForm = this.fb.group({
    venmoId: [this.currentUser()?.venmoId],
    paypalId: [this.currentUser()?.paypalId],
    cashAppId: [this.currentUser()?.cashAppId],
    zelleId: [this.currentUser()?.zelleId],
  });

  constructor() {
    effect(() => {
      this.selectedGroup.set(this.currentUser()?.defaultGroupRef ?? null);
      this.groupForm.patchValue({
        groupRef: this.currentUser()?.defaultGroupRef,
      });
      this.emailForm.patchValue({ email: this.currentUser()?.email });
      this.paymentsForm.patchValue({
        venmoId: this.currentUser()?.venmoId,
        paypalId: this.currentUser()?.paypalId,
        cashAppId: this.currentUser()?.cashAppId,
        zelleId: this.currentUser()?.zelleId,
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
    const actionCodeSettings = {
      url: window.location.origin + '/auth/account-action',
      handleCodeInApp: true,
    };
    sendEmailVerification(this.firebaseUser(), actionCodeSettings)
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
          'Close'
        );
      });
  }

  onSubmitEmail(): void {
    this.emailForm.disable();
    const newEmail = this.emailForm.value.email;
    if (newEmail !== this.firebaseUser().email) {
      updateEmail(this.firebaseUser(), newEmail)
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
      updatePassword(this.firebaseUser(), changes.password)
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

  async onSubmitPayments(): Promise<void> {
    const changes = this.paymentsForm.value;
    this.loading.loadingOn();
    try {
      await this.userService.updateUser({
        venmoId: changes.venmoId,
        paypalId: changes.paypalId,
        cashAppId: changes.cashAppId,
        zelleId: changes.zelleId,
      });
      this.snackBar.open('Payment service IDs updated.', 'OK');
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'update_payments',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not update payment service IDs.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  async acceptReceiptPolicy(): Promise<void> {
    this.loading.loadingOn();
    try {
      await this.userService.updateUser({ receiptPolicy: true });
      this.receiptPolicyAcknowledged.set(false);
      this.snackBar.open('Receipt retention policy accepted.', 'OK');
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'accept_receipt_policy',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not accept receipt policy.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  async updateData(): Promise<void> {
    this.loading.loadingOn();
    try {
      // const verifyEmail = httpsCallable(this.functions, 'verifyUserEmail');
      // verifyEmail({ uid: 'rUYCPmIYB7fDjfaS3aeoDnHKnsh1' })
      //   .then((result) => console.log(result))
      //   .catch((error) => console.error(error));
      await Promise.all([
        //   this.expenseService.removeHasReceiptField(),
        //   this.expenseService.migrateCategoryIdsToRefs(),
        //   this.memorizedService.migrateCategoryIdsToRefs(),
        //   this.userService.migrateGroupIdsToRefs(),
        //   this.memberService.migrateUserIdsToRefs(),
        //   this.splitService.migrateFieldIdsToRefs(),
        //   this.groupService.normalizeAllGroupDatesToUTC(),
        //this.groupService.setDefaultCurrencyForAllGroups(),
        this.expenseService.migrateDateTimestampToString(),
        this.splitService.migrateDateTimestampToString(),
        this.historyService.migrateDateTimestampToString(),
      ]);
      this.snackBar.open('Data updated.', 'Close');
    } catch (error) {
      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'data_update',
        message: error.message,
      });
      this.snackBar.open(
        'Something went wrong - could not update data.',
        'Close'
      );
    } finally {
      this.loading.loadingOff();
    }
  }
}
