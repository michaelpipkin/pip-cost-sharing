import { Routes } from '@angular/router';
import { AuthMainComponent } from '@components/auth/auth-main/auth-main.component';
import { loggedInGuard } from './guards.guard';

export const authRoutes: Routes = [
  {
    path: '',
    component: AuthMainComponent,
    children: [
      {
        path: 'login',
        title: 'Login',
        loadComponent: () =>
          import('@components/auth/login/login.component').then(
            (m) => m.LoginComponent
          ),
        canActivate: [loggedInGuard],
      },
      {
        path: 'register',
        title: 'Register',
        loadComponent: () =>
          import('@components/auth/register/register.component').then(
            (m) => m.RegisterComponent
          ),
        canActivate: [loggedInGuard],
      },
      {
        path: 'forgot-password',
        title: 'Forgot Password',
        loadComponent: () =>
          import(
            '@components/auth/forgot-password/forgot-password.component'
          ).then((m) => m.ForgotPasswordComponent),
      },
      {
        path: 'reset-password',
        title: 'Reset Password',
        loadComponent: () =>
          import(
            '@components/auth/reset-password/reset-password.component'
          ).then((m) => m.ResetPasswordComponent),
      },
      {
        path: 'account',
        title: 'Account',
        loadComponent: () =>
          import('@components/auth/account/account.component').then(
            (m) => m.AccountComponent
          ),
      },
    ],
  },
];
