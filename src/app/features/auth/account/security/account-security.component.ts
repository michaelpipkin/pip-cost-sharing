import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { PasswordForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { UserStore } from '@store/user.store';
import { User as FirebaseUser, getAuth, updatePassword } from 'firebase/auth';
import { applyPasswordMatch } from '../../auth-main/password-match-schema';

@Component({
  selector: 'app-account-security',
  templateUrl: './account-security.component.html',
  imports: [
    FormField,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSecurityComponent {
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly userStore = inject(UserStore);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;

  firebaseUser = signal<FirebaseUser>(this.auth.currentUser);
  hidePassword = model<boolean>(true);
  hideConfirm = model<boolean>(true);

  protected readonly passwordModel = signal<PasswordForm>({
    password: '',
    confirmPassword: '',
  });
  protected readonly passwordForm = form(this.passwordModel, (p) => {
    applyPasswordMatch(p);
  });

  constructor() {
    effect(() => {
      if (this.isGoogleUser()) {
        this.router.navigate(['/auth/account/profile']);
      }
    });
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirm() {
    this.hideConfirm.update((h) => !h);
  }

  async onSubmitPassword(): Promise<void> {
    const f = this.passwordForm().value();
    const user = this.firebaseUser()!;
    this.loading.loadingOn();
    try {
      if (f.password === '') {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Password cannot be empty' },
        });
        return;
      }
      await updatePassword(user, f.password);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Your password has been updated' },
      });
      this.passwordForm().reset({ password: '', confirmPassword: '' });
    } catch (error) {
      this.analytics.logError(
        'Account Security Component',
        'update_password',
        error instanceof Error ? error.message : 'Unknown error'
      );
      const code = (error as { code?: string } | null)?.code;
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message:
            code === 'auth/requires-recent-login'
              ? 'For security, please sign out and sign in again, then change your password.'
              : 'Something went wrong - your password could not be updated',
        },
      });
    } finally {
      this.loading.loadingOff();
    }
  }
}
