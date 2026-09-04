import { Routes } from '@angular/router';
import { AdminShellComponent } from './admin-shell/admin-shell.component';
import { AdminErrorLogComponent } from './error-log/error-log.component';
import { AdminEmailLogComponent } from './email-log/email-log.component';
import { AdminReportsComponent } from './reports/reports.component';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', redirectTo: 'reports', pathMatch: 'full' },
      {
        path: 'reports',
        title: 'Admin Reports',
        component: AdminReportsComponent,
      },
      {
        path: 'email-log',
        title: 'Email Delivery Log',
        component: AdminEmailLogComponent,
      },
      {
        path: 'error-log',
        title: 'App Error Log',
        component: AdminErrorLogComponent,
      },
    ],
  },
];
