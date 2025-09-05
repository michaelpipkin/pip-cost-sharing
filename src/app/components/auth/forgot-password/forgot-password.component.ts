import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
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
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

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
      await sendPasswordResetEmail(this.auth, email);
      this.snackBar.open(
        'Password reset email sent. Please check your email.',
        'Close'
      );
      this.router.navigate(['/login']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_category',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Error sending password reset email. Please try again.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
