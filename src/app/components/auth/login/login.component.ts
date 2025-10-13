import { Component, inject } from '@angular/core';
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
import { RouterModule } from '@angular/router';
import { LoadingService } from '@shared/loading/loading.service';
import {
  fetchSignInMethodsForEmail,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';

@Component({
  selector: 'app-login',
  imports: [
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  protected readonly auth = inject(getAuth);
  protected readonly loading = inject(LoadingService);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackBar = inject(MatSnackBar);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  get l() {
    return this.loginForm.controls;
  }

  async emailLogin() {
    try {
      this.loading.loadingOn();
      const email = this.loginForm.value.email;
      const password = this.loginForm.value.password;
      const signInMethods = await fetchSignInMethodsForEmail(this.auth, email);
      if (signInMethods.length === 1 && signInMethods[0] === 'google.com') {
        this.snackBar.open('Please sign in with Google', 'Close');
        return;
      } else {
        await signInWithEmailAndPassword(this.auth, email, password);
        // Navigation handled automatically by UserService.onAuthStateChanged
      }
    } catch (error: any) {
      this.snackBar.open(error.message, 'Close');
    } finally {
      this.loading.loadingOff();
    }
  }

  async googleLogin() {
    try {
      this.loading.loadingOn();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
      // Navigation handled automatically by UserService.onAuthStateChanged
    } catch (error: any) {
      this.snackBar.open(error.message, 'Close');
    } finally {
      this.loading.loadingOff();
    }
  }
}
