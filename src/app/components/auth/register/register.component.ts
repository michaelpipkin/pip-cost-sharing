import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  model,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  getAuth,
  sendEmailVerification,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { passwordMatchValidator } from '../auth-main/password-match-validator';
export declare const hcaptcha: any;

@Component({
  selector: 'app-register',
  imports: [
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly router = inject(Router);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly functions = inject(getFunctions);
  protected readonly pwaDetection = inject(PwaDetectionService);
  readonly #destroyRef = inject(DestroyRef);

  hidePassword = model<boolean>(true);
  hideConfirmPassword = model<boolean>(true);

  passedCaptcha = signal<boolean>(false);
  hCaptchaWidgetId = signal<string>('');

  #intervalId: ReturnType<typeof setInterval> | null = null;

  registerForm = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator() }
  );

  constructor() {
    afterNextRender(() => {
      const widgetId = hcaptcha.render('hcaptcha-container', {
        sitekey: 'fbd4c20a-78ac-493c-bf4a-f65c143a2322',
        callback: async (token: String) => {
          const validateHCaptcha = httpsCallable(
            this.functions,
            'validateHCaptcha'
          );
          try {
            const result = await validateHCaptcha({ token: token });
            if (result.data === 'Success') {
              this.passedCaptcha.set(true);
              this.#intervalId = setInterval(() => {
                hcaptcha.reset(this.hCaptchaWidgetId());
                this.passedCaptcha.set(false);
              }, 90000);
            }
          } catch (error) {
            logEvent(this.analytics, 'hCaptcha_error', {
              error: error.message,
            });
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

  get r() {
    return this.registerForm.controls;
  }

  async register() {
    try {
      this.loading.loadingOn();
      const email = this.registerForm.value.email;
      const password = this.registerForm.value.password;
      const signInMethods = await fetchSignInMethodsForEmail(this.auth, email);
      if (signInMethods.length > 0 && signInMethods.includes('password')) {
        this.snackBar.open(
          'Account already exists for this email address',
          'Close'
        );
        return;
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          this.auth,
          email,
          password
        );
        const actionCodeSettings = {
          url: window.location.origin + '/auth/account-action',
          handleCodeInApp: true,
        };
        sendEmailVerification(userCredential.user, actionCodeSettings).catch(
          (err: Error) => {
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'verify_email',
              message: err.message,
            });
            this.snackBar.open(
              'Something went wrong - verification email could not be sent.',
              'Close'
            );
          }
        );
        this.snackBar.open(
          'Account created! Please check your email to verify your email address before accessing the app.',
          'Close'
        );
        // Navigation will be handled automatically by auth state change
      }
    } catch (error: any) {
      this.snackBar.open(error.message, 'Close');
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
