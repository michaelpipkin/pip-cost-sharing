import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  model,
  signal,
} from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { PasswordForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';
import { FirebaseError } from 'firebase/app';
import {
  applyActionCode,
  confirmPasswordReset,
  getAuth,
  sendEmailVerification,
} from 'firebase/auth';
import { applyPasswordMatch } from '../auth-main/password-match-schema';
import { waitForAuthInit } from '../guards.guard';

// verifyAndChangeEmail is the link verifyBeforeUpdateEmail sends to a new
// address (account-profile's email change): using it makes that address the
// sign-in address.
const ACTION_MODES = [
  'verifyEmail',
  'verifyAndChangeEmail',
  'resetPassword',
  'recoverEmail',
] as const;
type ActionMode = (typeof ACTION_MODES)[number];

function isActionMode(mode: unknown): mode is ActionMode {
  return ACTION_MODES.includes(mode as ActionMode);
}

// handleError's wording ("Failed to <label>.") and the analytics event of
// each email link.
const EMAIL_ACTIONS = {
  verifyEmail: { label: 'verify email', event: 'email_verified' },
  verifyAndChangeEmail: { label: 'change email', event: 'email_changed' },
  recoverEmail: { label: 'recover email', event: 'email_recovered' },
} as const;

// A thrown value's message and (Firebase-style) code, whatever was thrown.
function errorDetails(error: unknown): { code: string | undefined; message: string } {
  const { code, message } = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
  };
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : 'Unknown error',
  };
}

@Component({
  selector: 'app-account-action',
  imports: [
    FormField,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    RouterLink,
  ],
  templateUrl: './account-action.component.html',
  styleUrl: './account-action.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountActionComponent {
  protected readonly auth = inject(getAuth);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly loading = inject(LoadingService);
  protected readonly userService = inject(UserService);
  protected readonly userStore = inject(UserStore);

  mode = signal<ActionMode | null>(null);
  oobCode = signal<string>('');
  processing = signal<boolean>(false);
  success = signal<boolean>(false);
  errorMessage = signal<string>('');
  // A signal, refreshed after each action: confirming an email change can
  // end the session (see #syncVerifiedEmail).
  protected readonly isUserLoggedIn = signal<boolean>(!!this.auth.currentUser);
  protected readonly resending = signal<boolean>(false);

  hidePassword = model<boolean>(true);
  hideConfirmPassword = model<boolean>(true);

  protected readonly resetPasswordModel = signal<PasswordForm>({
    password: '',
    confirmPassword: '',
  });
  protected readonly resetPasswordForm = form(this.resetPasswordModel, (p) => {
    required(p.password, { message: '*Required' });
    required(p.confirmPassword, { message: '*Required' });
    applyPasswordMatch(p);
  });

  constructor() {
    afterNextRender(async () => {
      await this.handleRouteParams();
    });
  }

  private async handleRouteParams(): Promise<void> {
    // The route has no guard, and an emailed link opens in a fresh load:
    // wait for the persisted sign-in, so a signed-in user's verified address
    // is written now rather than treated as signed out.
    await waitForAuthInit(this.auth);
    this.isUserLoggedIn.set(!!this.auth.currentUser);

    const params = this.route.snapshot.queryParams;
    const oobCode = params['oobCode'];
    const mode = params['mode'];

    if (!oobCode) {
      // If user is logged in and verified, redirect to expenses page
      if (this.auth.currentUser?.emailVerified) {
        await this.router.navigate([ROUTE_PATHS.EXPENSES_ROOT]);
        return;
      }
      this.errorMessage.set('Invalid link. No code provided.');
      await this.analytics.logError(
        'Account Action Component',
        'process_action',
        'No oobCode in URL',
        'N/A'
      );
      return;
    }

    if (!isActionMode(mode)) {
      this.errorMessage.set('Invalid link. Unknown action.');
      await this.analytics.logError(
        'Account Action Component',
        'process_action',
        `Invalid mode: ${mode}`,
        'N/A'
      );
      return;
    }

    this.mode.set(mode);
    this.oobCode.set(oobCode);

    if (mode !== 'resetPassword') {
      await this.processEmailAction(mode);
    }
    // For resetPassword, we just show the form
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirmPassword() {
    this.hideConfirmPassword.update((h) => !h);
  }

  // The three email links. Each applies its code, then (signed in, in this
  // browser) writes the account's now-verified address to the profile and
  // links invited members: verifyEmail confirms the current address,
  // verifyAndChangeEmail makes a new one the sign-in address, recoverEmail
  // undoes a change.
  //
  // Changing (or recovering) the sign-in address is a major account change,
  // and production Firebase revokes the session's tokens: the reload or token
  // refresh after the code then fails and the SDK signs out. The code was
  // applied, so that is still a success: the page says to sign in with the
  // new address, and UserService is told to expect the sign-out rather than
  // report "Your session has expired".
  private async processEmailAction(
    mode: Exclude<ActionMode, 'resetPassword'>
  ): Promise<void> {
    const action = EMAIL_ACTIONS[mode];
    const changesAddress = mode !== 'verifyEmail';
    if (changesAddress && this.auth.currentUser) {
      this.userService.expectSignOut(true);
    }
    this.processing.set(true);

    try {
      try {
        await applyActionCode(this.auth, this.oobCode());
      } catch (error) {
        this.handleError(action.label, error);
        return;
      }

      try {
        await this.#syncVerifiedEmail();
      } catch (error) {
        // Not a failure of the link: the code is applied. The next sign-in
        // syncs the profile (UserService) and the Groups page links.
        this.analytics.logError(
          'Account Action Component',
          action.label,
          'Code applied, but the profile could not be updated',
          error instanceof Error ? error.message : 'Unknown error'
        );
        if (changesAddress && this.auth.currentUser) {
          // The session is likely revoked but not yet signed out (e.g.
          // auth/user-not-found); sign out so the page and the app agree.
          await this.userService.logout(false);
        }
      }

      this.success.set(true);
      this.analytics.logEvent(action.event, {
        component: 'Account Action Component',
      });
    } finally {
      this.processing.set(false);
      this.isUserLoggedIn.set(!!this.auth.currentUser);
      // Still signed in: the expected sign-out didn't happen, so stop
      // expecting it (signed out, UserService's listener clears it).
      if (this.auth.currentUser) this.userService.expectSignOut(false);
    }
  }

  // Signed in (in this browser): reload the user for the new address and
  // emailVerified, then write the profile and link invites (that refreshes
  // the ID token first, so the rules and the callable see the verified
  // address). Signed out, there is nothing to do here: the next sign-in
  // syncs the verified address (UserService) and the Groups page links.
  async #syncVerifiedEmail(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    try {
      await user.reload();
    } catch (error) {
      // A revoked session: the SDK has signed out before reload() rejects.
      if (!this.auth.currentUser) return;
      throw error;
    }
    // The link was for an address this browser's signed-in account doesn't
    // have (signed in to a different, unverified account): nothing to sync,
    // and the rules would refuse the write.
    if (!user.emailVerified) return;
    await this.userService.updateUserEmailAndLinkMembers(user.email!);
    this.userStore.setIsEmailConfirmed(user.emailVerified);
  }

  async resetPassword(): Promise<void> {
    const password = this.resetPasswordForm().value().password;
    this.loading.loadingOn();

    try {
      await confirmPasswordReset(this.auth, this.oobCode(), password);
      this.success.set(true);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Password reset successfully' },
      });

      this.analytics.logEvent('password_reset_success', {
        component: 'Account Action Component',
      });
    } catch (error) {
      this.handleError('reset password', error);
    } finally {
      this.loading.loadingOff();
    }
  }

  async resendVerificationEmail(): Promise<void> {
    if (!this.auth.currentUser) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: 'You must be logged in to resend the verification email',
        },
      });
      return;
    }

    try {
      this.resending.set(true);

      const actionCodeSettings = {
        url: globalThis.location.origin + '/auth/account-action',
        handleCodeInApp: true,
      };

      await sendEmailVerification(this.auth.currentUser, actionCodeSettings);

      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Verification email sent! Please check your inbox' },
      });

      this.analytics.logEvent('verification_email_resent', {
        component: 'Account Action Component',
      });
    } catch (error) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: `Failed to send verification email: ${errorDetails(error).message}`,
        },
      });

      if (!(error instanceof FirebaseError)) {
        this.analytics.logError(
          'Account Action Component',
          'resend_verification_email',
          'Failed to resend verification email',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    } finally {
      this.resending.set(false);
    }
  }

  private handleError(action: string, error: unknown): void {
    const { code, message } = errorDetails(error);
    let errorMsg = `Failed to ${action}. `;

    if (code === 'auth/invalid-action-code') {
      errorMsg += 'The link is invalid or has expired.';
    } else if (code === 'auth/expired-action-code') {
      errorMsg += 'The link has expired.';
    } else if (code === 'auth/user-disabled') {
      errorMsg += 'This user account has been disabled.';
    } else if (code === 'auth/user-not-found') {
      errorMsg += 'No user found for this link.';
    } else if (code === 'auth/weak-password') {
      errorMsg += 'Password is too weak.';
    } else {
      errorMsg += message;
    }

    this.errorMessage.set(errorMsg);

    if (!(error instanceof FirebaseError)) {
      this.analytics.logError(
        'Account Action Component',
        action,
        message,
        code
      );
    }

    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: errorMsg },
    });
  }

  getTitle(): string {
    switch (this.mode()) {
      case 'verifyEmail':
        return 'Email Verification';
      case 'verifyAndChangeEmail':
        return 'Email Change';
      case 'resetPassword':
        return 'Reset Password';
      case 'recoverEmail':
        return 'Email Recovery';
      default:
        return 'Account Action';
    }
  }

  getSuccessMessage(): string {
    switch (this.mode()) {
      case 'verifyEmail':
        return "You've successfully confirmed your email address!";
      case 'verifyAndChangeEmail':
        return this.isUserLoggedIn()
          ? 'Your new email address is confirmed!'
          : 'Your email address has been changed. Please sign in with your new address.';
      case 'resetPassword':
        return 'Your password has been reset successfully!';
      case 'recoverEmail':
        return 'Your email address has been recovered successfully!';
      default:
        return 'Action completed successfully!';
    }
  }

  // The line under the success message for the email links (null for the
  // other modes).
  getSuccessHint(): string | null {
    const mode = this.mode();
    if (mode === 'resetPassword' || mode === null) return null;
    if (this.isUserLoggedIn()) {
      return mode === 'verifyAndChangeEmail'
        ? `You now sign in with ${this.auth.currentUser?.email}.`
        : 'You can now access all features of the app.';
    }
    // The change message already says to sign in with the new address.
    return mode === 'verifyAndChangeEmail'
      ? null
      : 'You can now log in to your account.';
  }

  getProcessingMessage(): string {
    switch (this.mode()) {
      case 'verifyEmail':
        return 'Verifying your email address...';
      case 'verifyAndChangeEmail':
        return 'Confirming your new email address...';
      case 'recoverEmail':
        return 'Recovering your email address...';
      default:
        return 'Processing...';
    }
  }
}
