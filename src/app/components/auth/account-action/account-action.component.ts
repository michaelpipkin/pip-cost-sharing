import { CommonModule } from '@angular/common';
import { Component, inject, model, OnInit, signal } from '@angular/core';
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
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
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
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
})
export class AccountActionComponent implements OnInit {
  protected readonly auth = inject(getAuth);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly loading = inject(LoadingService);
  protected readonly fb = inject(FormBuilder);

  mode = signal<ActionMode | null>(null);
  oobCode = signal<string>('');
  processing = signal<boolean>(false);
  success = signal<boolean>(false);
  errorMessage = signal<string>('');
  isUserLoggedIn = signal<boolean>(false);
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

  ngOnInit(): void {
    this.isUserLoggedIn.set(!!this.auth.currentUser);

    this.route.queryParams.subscribe((params) => {
      const oobCode = params['oobCode'];
      const mode = params['mode'] as ActionMode;

      if (!oobCode) {
        this.errorMessage.set('Invalid link. No code provided.');
        logEvent(this.analytics, 'error', {
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
        logEvent(this.analytics, 'error', {
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
    });
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
      }

      this.success.set(true);

      logEvent(this.analytics, 'email_verified', {
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

      logEvent(this.analytics, 'email_recovered', {
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
      this.snackBar.open('Password reset successfully', 'Close');

      logEvent(this.analytics, 'password_reset_success', {
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
      this.snackBar.open(
        'You must be logged in to resend the verification email.',
        'Close',
        { verticalPosition: 'top' }
      );
      return;
    }

    try {
      this.resending.set(true);

      const actionCodeSettings = {
        url: window.location.origin + '/auth/account-action',
        handleCodeInApp: true,
      };

      await sendEmailVerification(this.auth.currentUser, actionCodeSettings);

      this.snackBar.open(
        'Verification email sent! Please check your inbox.',
        'Close',
        { duration: 5000, verticalPosition: 'top' }
      );

      logEvent(this.analytics, 'verification_email_resent', {
        component: this.constructor.name,
      });
    } catch (error: any) {
      this.snackBar.open(
        `Failed to send verification email: ${error.message}`,
        'Close',
        { verticalPosition: 'top' }
      );

      logEvent(this.analytics, 'error', {
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

    logEvent(this.analytics, 'error', {
      component: this.constructor.name,
      action: action,
      message: error.message,
      code: error.code,
    });

    this.snackBar.open(errorMsg, 'Close', {
      duration: 0,
      verticalPosition: 'top',
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
