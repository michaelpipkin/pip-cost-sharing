import { Routes } from '@angular/router';
import { HistoryComponent } from '@components/history/history/history.component';
import { SummaryComponent } from '@components/summary/summary/summary.component';

export const analysisRoutes: Routes = [
  {
    path: 'summary',
    title: 'Summary',
    component: SummaryComponent,
  },
  {
    path: 'history',
    title: 'History',
    component: HistoryComponent,
  },
];