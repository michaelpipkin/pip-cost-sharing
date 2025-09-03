import { Component, inject, model, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
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
export class ResetPasswordComponent implements OnInit {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

  oobCode = signal<string>('');

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
    this.route.queryParams.subscribe((params) => {
      if (!params['oobCode']) {
        this.router.navigate(['/login']);
      }
      this.oobCode.set(params['oobCode']);
    });
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
        this.snackBar.open('Password reset successfully', 'Close');
        this.router.navigate(['/login']);
      })
      .catch((error) => {
        if (error?.code === 'auth/invalid-action-code') {
          this.snackBar.open('Invalid reset link', 'Close');
        } else if (error?.code === 'auth/expired-action-code') {
          this.snackBar.open('Reset link expired', 'Close');
        } else {
          logEvent(this.analytics, 'reset_password_error', {
            error: error.message,
          });
          this.snackBar.open(error.message, 'Close');
        }
      })
      .finally(() => {
        this.loading.loadingOff();
      });
  }
}
