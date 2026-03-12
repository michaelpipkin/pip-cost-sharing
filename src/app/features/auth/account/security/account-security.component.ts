import {
  Component,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserStore } from '@store/user.store';
import { User as FirebaseUser, getAuth, updatePassword } from 'firebase/auth';

@Component({
  selector: 'app-account-security',
  templateUrl: './account-security.component.html',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
})
export class AccountSecurityComponent {
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;

  constructor() {
    effect(() => {
      if (this.isGoogleUser()) {
        this.router.navigate(['/auth/account/profile']);
      }
    });
  }

  firebaseUser = signal<FirebaseUser>(this.auth.currentUser);
  hidePassword = model<boolean>(true);
  hideConfirm = model<boolean>(true);

  passwordForm = this.fb.group(
    {
      password: '',
      confirmPassword: '',
    },
    { validators: this.passwordMatchValidator }
  );

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirm() {
    this.hideConfirm.update((h) => !h);
  }

  passwordMatchValidator(g: AbstractControl) {
    return g.get('password')!.value === g.get('confirmPassword')!.value
      ? null
      : { mismatch: true };
  }

  onSubmitPassword(): void {
    const changes = this.passwordForm.value;
    this.loading.loadingOn();
    try {
      if (changes.password !== '') {
        updatePassword(this.firebaseUser()!, changes.password!)
          .then(() => {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Your password has been updated' },
            });
            this.passwordForm.reset();
          })
          .catch(() => {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: {
                message:
                  'Something went wrong - your password could not be updated',
              },
            });
          });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Password cannot be empty' },
        });
      }
    } catch (error) {
      this.analytics.logError(
        'Account Security Component',
        'update_password',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      this.loading.loadingOff();
    }
  }
}
