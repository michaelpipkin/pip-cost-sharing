import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { applyActionCode, getAuth, sendEmailVerification } from 'firebase/auth';

@Component({
  selector: 'app-confirm-email',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: './confirm-email.component.html',
  styleUrl: './confirm-email.component.scss',
})
export class ConfirmEmailComponent implements OnInit {
  protected readonly auth = inject(getAuth);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

  verifying = signal<boolean>(true);
  success = signal<boolean>(false);
  errorMessage = signal<string>('');
  isUserLoggedIn = signal<boolean>(false);
  resending = signal<boolean>(false);

  ngOnInit(): void {
    // Check if user is logged in
    this.isUserLoggedIn.set(!!this.auth.currentUser);

    // Get the oobCode from query parameters
    this.route.queryParams.subscribe((params) => {
      const oobCode = params['oobCode'];
      const mode = params['mode'];

      if (!oobCode) {
        this.verifying.set(false);
        this.errorMessage.set('Invalid verification link. No code provided.');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'verify_email',
          message: 'No oobCode in URL',
        });
        return;
      }

      if (mode !== 'verifyEmail') {
        this.verifying.set(false);
        this.errorMessage.set('Invalid verification link. Wrong mode.');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'verify_email',
          message: `Wrong mode: ${mode}`,
        });
        return;
      }

      this.verifyEmail(oobCode);
    });
  }

  private async verifyEmail(oobCode: string): Promise<void> {
    try {
      // Apply the action code to verify the email
      await applyActionCode(this.auth, oobCode);

      this.verifying.set(false);
      this.success.set(true);

      logEvent(this.analytics, 'email_verified', {
        component: this.constructor.name,
      });
    } catch (error: any) {
      this.verifying.set(false);
      this.success.set(false);

      // Handle specific error cases
      let errorMsg = 'Failed to verify email. ';
      if (error.code === 'auth/invalid-action-code') {
        errorMsg += 'The verification link is invalid or has expired.';
      } else if (error.code === 'auth/expired-action-code') {
        errorMsg += 'The verification link has expired.';
      } else {
        errorMsg += error.message;
      }

      this.errorMessage.set(errorMsg);

      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'verify_email',
        message: error.message,
        code: error.code,
      });

      this.snackBar.open(errorMsg, 'Close', {
        duration: 0,
        verticalPosition: 'top',
      });
    }
  }

  async resendVerificationEmail(): Promise<void> {
    if (!this.auth.currentUser) {
      this.snackBar.open(
        'You must be logged in to resend the verification email.',
        'Close',
        {
          verticalPosition: 'top',
        }
      );
      return;
    }

    try {
      this.resending.set(true);
      const actionCodeSettings = {
        url: window.location.origin + '/auth/confirm-email',
        handleCodeInApp: true,
      };

      await sendEmailVerification(this.auth.currentUser, actionCodeSettings);

      this.snackBar.open(
        'Verification email sent! Please check your inbox.',
        'Close',
        {
          duration: 5000,
          verticalPosition: 'top',
        }
      );

      logEvent(this.analytics, 'verification_email_resent', {
        component: this.constructor.name,
      });
    } catch (error: any) {
      this.snackBar.open(
        `Failed to send verification email: ${error.message}`,
        'Close',
        {
          verticalPosition: 'top',
        }
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
}
