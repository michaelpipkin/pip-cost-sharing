
import { Component, computed, inject, model, signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { LoadingService } from '@shared/loading/loading.service';
import { UserService } from '@services/user.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserStore } from '@store/user.store';
import {
  applyActionCode,
  confirmPasswordReset,
  getAuth,
  sendEmailVerification,
} from 'firebase/auth';
import { passwordMatchValidator } from '../auth-main/password-match-validator';

type ActionMode = 'verifyEmail' | 'resetPassword' | 'recoverEmail';

@Component({
  selector: 'app-account-action',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    RouterLink
],
  templateUrl: './account-action.component.html',
  styleUrl: './account-action.component.scss',
})
export class AccountActionComponent {
  protected readonly auth = inject(getAuth);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly snackbar = inject(MatSnackBar);
  private readonly analytics = inject(AnalyticsService);
  protected readonly loading = inject(LoadingService);
  protected readonly fb = inject(FormBuilder);
  protected readonly userService = inject(UserService);
  protected readonly userStore = inject(UserStore);

  mode = signal<ActionMode | null>(null);
  oobCode = signal<string>('');
  processing = signal<boolean>(false);
  success = signal<boolean>(false);
  errorMessage = signal<string>('');
  isUserLoggedIn = computed<boolean>(() => !!this.auth.currentUser);
  resending = signal<boolean>(false);

  hidePassword = model<boolean>(true);
  hideConfirmPassword = model<boolean>(true);

  resetPasswordForm = this.fb.group(
    {
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator() }
  );

  constructor() {
    const params = this.route.snapshot.queryParams;
    const oobCode = params['oobCode'];
    const mode = params['mode'] as ActionMode;

    if (!oobCode) {
      // If user is logged in and verified, redirect to expenses page
      if (this.auth.currentUser?.emailVerified) {
        this.router.navigate([ROUTE_PATHS.EXPENSES_ROOT]);
        return;
      }
      this.errorMessage.set('Invalid link. No code provided.');
      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'process_action',
        message: 'No oobCode in URL',
      });
      return;
    }

    if (
      !mode ||
      !['verifyEmail', 'resetPassword', 'recoverEmail'].includes(mode)
    ) {
      this.errorMessage.set('Invalid link. Unknown action.');
      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'process_action',
        message: `Invalid mode: ${mode}`,
      });
      return;
    }

    this.mode.set(mode);
    this.oobCode.set(oobCode);

    if (mode === 'verifyEmail') {
      this.processEmailVerification();
    } else if (mode === 'recoverEmail') {
      this.processEmailRecovery();
    }
    // For resetPassword, we just show the form
  }

  get r() {
    return this.resetPasswordForm.controls;
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirmPassword() {
    this.hideConfirmPassword.update((h) => !h);
  }

  private async processEmailVerification(): Promise<void> {
    this.processing.set(true);

    try {
      await applyActionCode(this.auth, this.oobCode());

      // Force reload the user to get updated emailVerified status
      if (this.auth.currentUser) {
        await this.auth.currentUser.reload();
        // Sync the email in Firestore and link any unlinked member records
        await this.userService.updateUserEmailAndLinkMembers(
          this.auth.currentUser.email
        );
        // Update UserStore with new email verification status
        this.userStore.setIsEmailConfirmed(this.auth.currentUser.emailVerified);
      }

      this.success.set(true);

      this.analytics.logEvent('email_verified', {
        component: this.constructor.name,
      });
    } catch (error: any) {
      this.handleError('verify email', error);
    } finally {
      this.processing.set(false);
    }
  }

  private async processEmailRecovery(): Promise<void> {
    this.processing.set(true);

    try {
      await applyActionCode(this.auth, this.oobCode());
      this.success.set(true);

      this.analytics.logEvent('email_recovered', {
        component: this.constructor.name,
      });
    } catch (error: any) {
      this.handleError('recover email', error);
    } finally {
      this.processing.set(false);
    }
  }

  async resetPassword(): Promise<void> {
    const password = this.resetPasswordForm.value.password;
    this.loading.loadingOn();

    try {
      await confirmPasswordReset(this.auth, this.oobCode(), password);
      this.success.set(true);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Password reset successfully' },
      });

      this.analytics.logEvent('password_reset_success', {
        component: this.constructor.name,
      });
    } catch (error: any) {
      this.handleError('reset password', error);
    } finally {
      this.loading.loadingOff();
    }
  }

  async resendVerificationEmail(): Promise<void> {
    if (!this.auth.currentUser) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'You must be logged in to resend the verification email' },
      });
      return;
    }

    try {
      this.resending.set(true);

      const actionCodeSettings = {
        url: window.location.origin + '/auth/account-action',
        handleCodeInApp: true,
      };

      await sendEmailVerification(this.auth.currentUser, actionCodeSettings);

      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Verification email sent! Please check your inbox' },
      });

      this.analytics.logEvent('verification_email_resent', {
        component: this.constructor.name,
      });
    } catch (error: any) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: `Failed to send verification email: ${error.message}` },
      });

      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'resend_verification_email',
        message: error.message,
      });
    } finally {
      this.resending.set(false);
    }
  }

  private handleError(action: string, error: any): void {
    let errorMsg = `Failed to ${action}. `;

    if (error.code === 'auth/invalid-action-code') {
      errorMsg += 'The link is invalid or has expired.';
    } else if (error.code === 'auth/expired-action-code') {
      errorMsg += 'The link has expired.';
    } else if (error.code === 'auth/user-disabled') {
      errorMsg += 'This user account has been disabled.';
    } else if (error.code === 'auth/user-not-found') {
      errorMsg += 'No user found for this link.';
    } else if (error.code === 'auth/weak-password') {
      errorMsg += 'Password is too weak.';
    } else {
      errorMsg += error.message;
    }

    this.errorMessage.set(errorMsg);

    this.analytics.logEvent('error', {
      component: this.constructor.name,
      action: action,
      message: error.message,
      code: error.code,
    });

    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: errorMsg },
    });
  }

  getTitle(): string {
    switch (this.mode()) {
      case 'verifyEmail':
        return 'Email Verification';
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
      case 'resetPassword':
        return 'Your password has been reset successfully!';
      case 'recoverEmail':
        return 'Your email address has been recovered successfully!';
      default:
        return 'Action completed successfully!';
    }
  }

  getProcessingMessage(): string {
    switch (this.mode()) {
      case 'verifyEmail':
        return 'Verifying your email address...';
      case 'recoverEmail':
        return 'Recovering your email address...';
      default:
        return 'Processing...';
    }
  }
}
