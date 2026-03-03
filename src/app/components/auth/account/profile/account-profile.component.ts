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
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@services/analytics.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@shared/loading/loading.service';
import { UserStore } from '@store/user.store';
import {
  User as FirebaseUser,
  getAuth,
  sendEmailVerification,
  updateEmail,
} from 'firebase/auth';

@Component({
  selector: 'app-account-profile',
  templateUrl: './account-profile.component.html',
  styleUrls: ['./account-profile.component.scss'],
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
  ],
})
export class AccountProfileComponent {
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly memberService = inject(MemberService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;
  currentUser = this.userStore.user;

  firebaseUser = signal<FirebaseUser | null>(this.auth.currentUser);
  hidePassword = model<boolean>(true);

  emailForm = this.fb.group({
    email: [this.currentUser()?.email, Validators.email],
  });

  constructor() {
    effect(() => {
      this.emailForm.patchValue({ email: this.currentUser()?.email });
    });
  }

  get e() {
    return this.emailForm.controls;
  }

  async verifyEmail(): Promise<void> {
    const actionCodeSettings = {
      url: window.location.origin + '/auth/account-action',
      handleCodeInApp: true,
    };
    sendEmailVerification(this.firebaseUser()!, actionCodeSettings)
      .then(() => {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Check your email to verify your email address' },
        });
      })
      .catch((err: Error) => {
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'verify_email',
          message: err.message,
        });
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message:
              'Something went wrong - verification email could not be sent',
          },
        });
      });
  }

  async onSubmitEmail(): Promise<void> {
    this.emailForm.disable();
    const newEmail = this.emailForm.value.email;
    if (newEmail !== this.firebaseUser()?.email) {
      try {
        await updateEmail(this.firebaseUser()!, newEmail!);
        this.userStore.setIsEmailConfirmed(false);
        await this.verifyEmail();
      } catch (err: any) {
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'update_email',
          message: err.message,
        });
        if (err.code === 'auth/email-already-in-use') {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: {
              message:
                'This email address is already in use by another account',
            },
          });
        } else {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: {
              message:
                'Something went wrong - your email address could not be updated',
            },
          });
        }
      }
    }
    this.emailForm.enable();
  }

  async syncMemberEmails(): Promise<void> {
    this.loading.loadingOn();
    try {
      const userRef = this.currentUser()!.ref!;
      const currentEmail = this.currentUser()!.email;
      const count = await this.memberService.updateAllMemberEmails(
        userRef,
        currentEmail
      );
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message:
            count > 0
              ? `Updated email on ${count} member record${count > 1 ? 's' : ''}`
              : 'No member records needed updating',
        },
      });
    } catch (error) {
      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'sync_member_emails',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: 'Something went wrong - could not update member emails',
        },
      });
    } finally {
      this.loading.loadingOff();
    }
  }
}
