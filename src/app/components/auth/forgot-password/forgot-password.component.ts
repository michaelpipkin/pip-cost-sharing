import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { Router, RouterModule } from '@angular/router';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'app-forgot-password',
  imports: [
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly router = inject(Router);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  forgotPasswordForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get f() {
    return this.forgotPasswordForm.controls;
  }

  async forgotPassword() {
    try {
      this.loading.loadingOn();
      const email = this.forgotPasswordForm.value.email;
      
      const actionCodeSettings = {
        url: window.location.origin + '/auth/account-action',
        handleCodeInApp: true,
      };
      
      await sendPasswordResetEmail(this.auth, email!, actionCodeSettings);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Password reset email sent. Please check your email.' },
      });
      this.router.navigate(['/login']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'add_category',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Error sending password reset email. Please try again.' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
