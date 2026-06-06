import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  email as emailValidator,
  form,
  FormField,
  required,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { ForgotPasswordForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { FirebaseError } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';

@Component({
  selector: 'app-forgot-password',
  imports: [
    RouterModule,
    FormField,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly router = inject(Router);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  protected readonly forgotPasswordModel = signal<ForgotPasswordForm>({
    email: '',
  });
  protected readonly forgotPasswordForm = form(this.forgotPasswordModel, (p) => {
    required(p.email, { message: '*Required' });
    emailValidator(p.email, { message: 'Invalid email address' });
  });

  async forgotPassword() {
    try {
      this.loading.loadingOn();
      const email = this.forgotPasswordForm().value().email;

      const actionCodeSettings = {
        url: globalThis.location.origin + '/auth/account-action',
        handleCodeInApp: true,
      };

      await sendPasswordResetEmail(this.auth, email, actionCodeSettings);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: 'Password reset email sent. Please check your email.',
        },
      });
      this.router.navigate(['/login']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        if (!(error instanceof FirebaseError)) {
          this.analytics.logError(
            'Forgot Password Component',
            'send_reset_email',
            'Failed to send password reset email',
            error.message
          );
        }
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message: 'Error sending password reset email. Please try again.',
          },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
