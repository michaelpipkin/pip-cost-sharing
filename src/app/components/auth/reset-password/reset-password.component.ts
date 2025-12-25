import { Component, inject, model, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { confirmPasswordReset, getAuth } from 'firebase/auth';
import { passwordMatchValidator } from '../auth-main/password-match-validator';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'app-reset-password',
  imports: [
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

  oobCode = signal<string>(this.route.snapshot.queryParams['oobCode'] || '');

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
    if (!this.oobCode()) {
      this.router.navigate(['/login']);
    }
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirmPassword() {
    this.hideConfirmPassword.update((h) => !h);
  }

  get r() {
    return this.resetPasswordForm.controls;
  }

  async resetPassword() {
    const password = this.resetPasswordForm.value.password;
    this.loading.loadingOn();
    await confirmPasswordReset(this.auth, this.oobCode(), password)
      .then(() => {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Password reset successfully' },
        });
        this.router.navigate(['/login']);
      })
      .catch((error) => {
        if (error?.code === 'auth/invalid-action-code') {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Invalid reset link' },
          });
        } else if (error?.code === 'auth/expired-action-code') {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Reset link expired' },
          });
        } else {
          logEvent(this.analytics, 'reset_password_error', {
            error: error.message,
          });
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: error.message },
          });
        }
      })
      .finally(() => {
        this.loading.loadingOff();
      });
  }
}
