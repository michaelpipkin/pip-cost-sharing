import { Routes } from '@angular/router';
import { AuthMainComponent } from '@components/auth/auth-main/auth-main.component';
import { basicAuthGuard, loggedInGuard } from './guards.guard';

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
        canActivate: [loggedInGuard],
      },
      {
        path: 'reset-password',
        title: 'Reset Password',
        loadComponent: () =>
          import(
            '@components/auth/reset-password/reset-password.component'
          ).then((m) => m.ResetPasswordComponent),
        canActivate: [loggedInGuard],
      },
      {
        path: 'account',
        title: 'Account',
        loadComponent: () =>
          import('@components/auth/account/account.component').then(
            (m) => m.AccountComponent
          ),
        canActivate: [basicAuthGuard],
        children: [
          {
            path: 'profile',
            title: 'Profile',
            loadComponent: () =>
              import(
                '@components/auth/account/profile/account-profile.component'
              ).then((m) => m.AccountProfileComponent),
          },
          {
            path: 'security',
            title: 'Security',
            loadComponent: () =>
              import(
                '@components/auth/account/security/account-security.component'
              ).then((m) => m.AccountSecurityComponent),
          },
          {
            path: 'payments',
            title: 'Payments',
            loadComponent: () =>
              import(
                '@components/auth/account/payments/account-payments.component'
              ).then((m) => m.AccountPaymentsComponent),
          },
          {
            path: 'preferences',
            title: 'Preferences',
            loadComponent: () =>
              import(
                '@components/auth/account/preferences/account-preferences.component'
              ).then((m) => m.AccountPreferencesComponent),
          },
          {
            path: 'legal',
            title: 'Legal',
            loadComponent: () =>
              import(
                '@components/auth/account/legal/account-legal.component'
              ).then((m) => m.AccountLegalComponent),
          },
        ],
      },
      {
        path: 'account-action',
        title: 'Account Action',
        loadComponent: () =>
          import(
            '@components/auth/account-action/account-action.component'
          ).then((m) => m.AccountActionComponent),
      },
      {
        path: 'delete-account',
        title: 'Delete Account',
        loadComponent: () =>
          import(
            '@components/auth/delete-account/delete-account.component'
          ).then((m) => m.DeleteAccountComponent),
      },
    ],
  },
];
