import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import {
  form,
  FormField,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { ProfileForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';
import { FirebaseError } from 'firebase/app';
import {
  ActionCodeSettings,
  User as FirebaseUser,
  getAuth,
  sendEmailVerification,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { singleEmail } from '@utils/email-validation';

@Component({
  selector: 'app-account-profile',
  templateUrl: './account-profile.component.html',
  styleUrls: ['./account-profile.component.scss'],
  imports: [
    FormField,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    RouterLink,
    MatDividerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountProfileComponent {
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly memberService = inject(MemberService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;
  isEmailConfirmed: Signal<boolean> = this.userStore.isEmailConfirmed;
  currentUser = this.userStore.user;

  firebaseUser = signal<FirebaseUser | null>(this.auth.currentUser);
  hidePassword = model<boolean>(true);
  // The address a change was requested to, until its emailed link is used.
  protected readonly pendingEmail = signal<string>('');

  protected readonly emailModel = signal<ProfileForm>({
    email: this.#signInEmail(),
  });
  protected readonly emailForm = form(this.emailModel, (p) => {
    singleEmail(p.email, { message: 'Invalid email address' });
  });

  constructor() {
    effect(() => {
      this.emailModel.set({ email: this.#signInEmail() });
    });
  }

  // The sign-in address, which is what Update Email changes. The profile
  // copy is '' until the address is verified (see UserService), so it is
  // only the fallback; reading it also re-runs the effect above whenever
  // the profile changes (e.g. after a confirmed change).
  #signInEmail(): string {
    const profileEmail = this.currentUser()?.email ?? '';
    return this.auth.currentUser?.email ?? profileEmail;
  }

  #actionCodeSettings(): ActionCodeSettings {
    return {
      url: globalThis.location.origin + '/auth/account-action',
      handleCodeInApp: true,
    };
  }

  async verifyEmail(): Promise<void> {
    const user = this.firebaseUser()!;
    sendEmailVerification(user, this.#actionCodeSettings())
      .then(() => {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Check your email to verify your email address' },
        });
      })
      .catch((err: Error) => {
        if (!(err instanceof FirebaseError)) {
          this.analytics.logError(
            'Account Profile Component',
            'verify_email',
            'Failed to send verification email',
            err.message
          );
        }
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message:
              'Something went wrong - verification email could not be sent',
          },
        });
      });
  }

  // Verify-before-update: Firebase emails a link to the NEW address, and the
  // sign-in address changes only when that link is used (account-action,
  // mode verifyAndChangeEmail). Until then the account, its verified status
  // and the profile all stay on the current address.
  async onSubmitEmail(): Promise<void> {
    const newEmail = this.emailForm().value().email;
    const user = this.firebaseUser()!;
    if (newEmail === user.email) return;
    try {
      await verifyBeforeUpdateEmail(user, newEmail, this.#actionCodeSettings());
      this.pendingEmail.set(newEmail);
      this.emailForm().reset({ email: user.email ?? '' });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: `Check ${newEmail} for a link to confirm your new email`,
        },
      });
    } catch (err: unknown) {
      if (!(err instanceof FirebaseError)) {
        this.analytics.logError(
          'Account Profile Component',
          'update_email',
          'Failed to update email address',
          err instanceof Error ? err.message : 'Unknown error'
        );
      }
      const code = (err as { code?: string } | null)?.code;
      let message =
        'Something went wrong - your email address could not be updated';
      if (code === 'auth/email-already-in-use') {
        message = 'This email address is already in use by another account';
      } else if (code === 'auth/requires-recent-login') {
        message =
          'For your security, sign out and sign back in, then change your email';
      }
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
    }
  }

  async onToggleEmailOptOut(event: MatSlideToggleChange): Promise<void> {
    try {
      await this.userService.updateUser({ emailOptOut: !event.checked });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: event.checked
            ? 'Email notifications enabled'
            : 'Email notifications disabled',
        },
      });
    } catch (error) {
      this.analytics.logError(
        'Account Profile Component',
        'toggle_email_opt_out',
        'Failed to save email preference',
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: 'Something went wrong - preference could not be saved',
        },
      });
    }
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
      const recordText = count === 1 ? 'record' : 'records';
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message:
            count > 0
              ? `Updated email on ${count} member ${recordText}`
              : 'No member records needed updating',
        },
      });
    } catch (error) {
      this.analytics.logError(
        'Account Profile Component',
        'sync_member_emails',
        'Failed to sync member emails',
        error instanceof Error ? error.message : 'Unknown error'
      );
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
