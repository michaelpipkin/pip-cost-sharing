import { Routes } from '@angular/router';
import { SummaryComponent } from '@features/summary/summary/summary.component';

export const analysisRoutes: Routes = [
  {
    path: 'summary',
    title: 'Summary',
    component: SummaryComponent,
  },
  {
    path: 'history',
    loadChildren: () =>
      import('@features/history/history.routes').then(
        (m) => m.historyRoutes
      ),
  },
];
