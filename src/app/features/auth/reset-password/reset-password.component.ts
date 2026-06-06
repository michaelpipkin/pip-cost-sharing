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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { PasswordForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { confirmPasswordReset, getAuth } from 'firebase/auth';
import { applyPasswordMatch } from '../auth-main/password-match-schema';

@Component({
  selector: 'app-reset-password',
  imports: [
    RouterModule,
    FormField,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  oobCode = signal<string>(this.route.snapshot.queryParams['oobCode'] || '');

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
      if (!this.oobCode()) {
        await this.router.navigate(['/login']);
      }
    });
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirmPassword() {
    this.hideConfirmPassword.update((h) => !h);
  }

  async resetPassword() {
    const password = this.resetPasswordForm().value().password;
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
          this.analytics.logEvent('reset_password_error', {
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
