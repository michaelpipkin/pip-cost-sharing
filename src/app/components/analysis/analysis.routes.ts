import { Routes } from '@angular/router';
import { SummaryComponent } from '@components/summary/summary/summary.component';

export const analysisRoutes: Routes = [
  {
    path: 'summary',
    title: 'Summary',
    component: SummaryComponent,
  },
  {
    path: 'history',
    loadChildren: () =>
      import('@components/history/history.routes').then(
        (m) => m.historyRoutes
      ),
  },
];
