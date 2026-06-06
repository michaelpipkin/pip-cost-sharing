import {
  ChangeDetectionStrategy,
  Component,
  inject,
  model,
  signal,
} from '@angular/core';
import {
  email as emailValidator,
  form,
  FormField,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { LoginForm } from '@models/user';
import { PwaDetectionService } from '@services/pwa-detection.service';
import {
  fetchSignInMethodsForEmail,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';

@Component({
  selector: 'app-login',
  imports: [
    RouterModule,
    FormField,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly pwaDetection = inject(PwaDetectionService);

  hidePassword = model<boolean>(true);

  protected readonly loginModel = signal<LoginForm>({ email: '', password: '' });
  protected readonly loginForm = form(this.loginModel, (p) => {
    emailValidator(p.email, { message: 'Invalid email address' });
  });

  isRunningInBrowser(): boolean {
    return this.pwaDetection.isRunningInBrowser();
  }

  isRunningAsApp(): boolean {
    return this.pwaDetection.isRunningAsApp();
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  async emailLogin() {
    try {
      this.loading.loadingOn();
      const { email, password } = this.loginForm().value();
      const signInMethods = await fetchSignInMethodsForEmail(this.auth, email);
      if (signInMethods.length === 1 && signInMethods[0] === 'google.com') {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Please sign in with Google' },
        });
        this.loading.loadingOff();
        return;
      } else {
        await signInWithEmailAndPassword(this.auth, email, password);
        // Navigation handled automatically by UserService.onAuthStateChanged
      }
    } catch {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message:
            'Could not sign you in. Please check your email and password.',
        },
      });
      this.loading.loadingOff();
    }
  }

  async googleLogin() {
    try {
      this.loading.loadingOn();
      if (this.isRunningAsApp()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const credential = GoogleAuthProvider.credential(
          result.credential?.idToken
        );

        await signInWithCredential(this.auth, credential);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(this.auth, provider);
      }
      // Navigation handled automatically by UserService.onAuthStateChanged
    } catch {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message:
            'There was a problem signing you in. Please try again or use a different sign-in method.',
        },
      });
      this.loading.loadingOff();
    }
  }
}
