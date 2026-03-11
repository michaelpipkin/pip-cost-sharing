import { Routes } from '@angular/router';
import { AdminShellComponent } from './admin-shell/admin-shell.component';
import { AdminErrorLogComponent } from './error-log/error-log.component';
import { AdminEmailLogComponent } from './email-log/email-log.component';
import { AdminStatisticsComponent } from './statistics/statistics.component';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', redirectTo: 'statistics', pathMatch: 'full' },
      {
        path: 'statistics',
        title: 'Admin Statistics',
        component: AdminStatisticsComponent,
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
