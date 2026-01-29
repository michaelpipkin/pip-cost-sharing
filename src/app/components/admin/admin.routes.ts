import { Routes } from '@angular/router';
import { AdminStatisticsComponent } from './statistics/statistics.component';

export const adminRoutes: Routes = [
  {
    path: 'statistics',
    title: 'Admin Statistics',
    component: AdminStatisticsComponent,
  },
];
