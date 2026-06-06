import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  model,
  signal,
} from '@angular/core';
import {
  email as emailValidator,
  form,
  FormField,
  required,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { RegisterForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  getAuth,
  sendEmailVerification,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { applyPasswordMatch } from '../auth-main/password-match-schema';
export declare const hcaptcha: any;

@Component({
  selector: 'app-register',
  imports: [
    RouterModule,
    FormField,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly router = inject(Router);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly functions = inject(getFunctions);
  protected readonly pwaDetection = inject(PwaDetectionService);
  readonly #destroyRef = inject(DestroyRef);

  hidePassword = model<boolean>(true);
  hideConfirmPassword = model<boolean>(true);

  passedCaptcha = signal<boolean>(false);
  hCaptchaWidgetId = signal<string>('');

  #intervalId: ReturnType<typeof setInterval> | null = null;

  protected readonly registerModel = signal<RegisterForm>({
    email: '',
    password: '',
    confirmPassword: '',
  });
  protected readonly registerForm = form(this.registerModel, (p) => {
    required(p.email, { message: 'Email is required.' });
    emailValidator(p.email, { message: 'Invalid email address.' });
    required(p.password, { message: 'Password is required.' });
    required(p.confirmPassword, { message: 'Confirm password is required.' });
    applyPasswordMatch(p);
  });

  constructor() {
    afterNextRender(() => {
      const widgetId = hcaptcha.render('hcaptcha-container', {
        sitekey: 'fbd4c20a-78ac-493c-bf4a-f65c143a2322',
        callback: async (token: string) => {
          const validateHCaptcha = httpsCallable<
            { token: string },
            { status: string }
          >(this.functions, 'validateHCaptcha');
          try {
            const result = await validateHCaptcha({ token: token });
            if (result.data.status === 'verified') {
              this.passedCaptcha.set(true);
              this.#intervalId = setInterval(() => {
                hcaptcha.reset(this.hCaptchaWidgetId());
                this.passedCaptcha.set(false);
              }, 90000);
            }
          } catch (error: any) {
            this.analytics.logEvent('hCaptcha_error', {
              error: error.message,
            });
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Captcha validation failed. Please try again.' },
            });
            hcaptcha.reset(this.hCaptchaWidgetId());
          }
        },
      });
      this.hCaptchaWidgetId.set(widgetId);
    });

    this.#destroyRef.onDestroy(() => {
      if (this.#intervalId) {
        clearInterval(this.#intervalId);
      }
    });
  }

  isRunningInBrowser(): boolean {
    return this.pwaDetection.isRunningInBrowser();
  }

  isRunningAsApp(): boolean {
    return this.pwaDetection.isRunningAsApp();
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirmPassword() {
    this.hideConfirmPassword.update((h) => !h);
  }

  async register() {
    try {
      this.loading.loadingOn();
      const { email, password } = this.registerForm().value();
      const signInMethods = await fetchSignInMethodsForEmail(this.auth, email);
      if (signInMethods.length > 0 && signInMethods.includes('password')) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Account already exists for this email address' },
        });
        return;
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          this.auth,
          email,
          password
        );
        const actionCodeSettings = {
          url: globalThis.location.origin + '/auth/account-action',
          handleCodeInApp: true,
        };
        sendEmailVerification(userCredential.user, actionCodeSettings).catch(
          (err: Error) => {
            if (!(err instanceof FirebaseError)) {
              this.analytics.logError(
                'Register Component',
                'verify_email',
                'Failed to send verification email after registration',
                err.message
              );
            }
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: {
                message:
                  'Something went wrong - verification email could not be sent',
              },
            });
          }
        );
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message:
              'Account created! Please check your email to verify your email address before accessing the app',
          },
        });
        // Navigation will be handled automatically by auth state change
      }
    } catch (error: any) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: error.message },
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  async openPrivacyPolicy(event: Event) {
    if (this.pwaDetection.isRunningAsApp()) {
      event.preventDefault();
      await Browser.open({ url: 'https://pipsplit.com/privacy-policy.html' });
    }
    // If running in browser, let the default behavior handle it (target="_blank")
  }
}
