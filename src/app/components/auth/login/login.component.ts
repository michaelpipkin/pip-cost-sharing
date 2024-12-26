import {
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  inject,
  model,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { environment } from 'src/environments/environment';
declare const hcaptcha: any;

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
})
export class LoginComponent {
  auth = inject(getAuth);
  userService = inject(UserService);
  loading = inject(LoadingService);
  router = inject(Router);
  fb = inject(FormBuilder);
  snackbar = inject(MatSnackBar);
  cdr = inject(ChangeDetectorRef);

  step1Complete = signal<boolean>(false);
  step2Complete = signal<boolean>(false);
  hidePassword = model<boolean>(true);
  newAccount = model<boolean>(false);

  emailField = viewChild<ElementRef>('emailInput');
  passwordField = viewChild<ElementRef>('passwordInput');

  emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  passwordForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  passedCaptcha = signal<boolean>(false);

  constructor() {
    effect(() => {
      if (this.newAccount()) {
        hcaptcha.render('hcaptcha-container', {
          sitekey: 'fbd4c20a-78ac-493c-bf4a-f65c143a2322',
          callback: (token: String) => {
            if (environment.useEmulators) {
              console.log(token);
            }
            this.passedCaptcha.set(true);
          },
        });
        const intervalId = setInterval(() => {
          if (hcaptcha.getResponse() === '') {
            this.passedCaptcha.set(false);
          }
        }, 5000);
        return () => {
          clearInterval(intervalId);
        };
      }
    });
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  get e() {
    return this.emailForm.controls;
  }

  get p() {
    return this.passwordForm.controls;
  }

  emailLogin() {
    this.step1Complete.set(true);
    this.cdr.detectChanges();
    setTimeout(() => {
      this.emailField().nativeElement.focus();
    }, 0);
  }

  async checkEmail() {
    const email = this.emailForm.value.email;
    const signInMethods = await fetchSignInMethodsForEmail(this.auth, email);
    if (signInMethods.length === 1 && signInMethods[0] === 'google.com') {
      this.snackbar.open('Please sign in with Google', 'Close');
      return;
    }
    if (!signInMethods.includes('password')) {
      // New user
      this.newAccount.set(true);
      this.passwordForm.get('displayName')?.setValidators(Validators.required);
    }
    this.step2Complete.set(true);
    this.emailForm.get('email')?.disable();

    this.cdr.detectChanges();

    setTimeout(() => {
      this.passwordField().nativeElement.focus();
    }, 0);
  }

  resetForm() {
    this.emailForm.reset();
    this.passwordForm.reset();
    this.emailForm.get('email')?.enable();
    this.emailForm.get('email')?.setErrors(null);
    this.emailForm.get('email')?.markAsPristine();
    this.emailForm.get('email')?.markAsUntouched();
    this.step1Complete.set(false);
    this.step2Complete.set(false);
    this.newAccount.set(false);
  }

  async emailPasswordLogin() {
    const email = this.emailForm.value.email;
    const password = this.passwordForm.value.password;
    if (this.newAccount()) {
      this.loading.loadingOn();
      await createUserWithEmailAndPassword(this.auth, email, password)
        .then(() => {
          this.router.navigateByUrl('/groups');
          this.loading.loadingOff();
        })
        .catch((error) => {
          this.snackbar.open(error.message, 'Close');
        });
    } else {
      await signInWithEmailAndPassword(this.auth, email, password)
        .then(() => {
          this.router.navigateByUrl('/groups');
          this.loading.loadingOff();
        })
        .catch((error) => {
          this.snackbar.open(error.message, 'Close');
        });
    }
  }

  googleLogin() {
    const provider = new GoogleAuthProvider();
    signInWithPopup(this.auth, provider)
      .then(() => {
        this.router.navigateByUrl('/programs');
        this.loading.loadingOff();
      })
      .catch((error) => {
        this.snackbar.open(error.message, 'Close');
      });
  }
}
