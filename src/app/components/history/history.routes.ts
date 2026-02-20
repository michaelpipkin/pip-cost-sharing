import { Routes } from '@angular/router';
import { noCrawlerGuard } from '@components/auth/guards.guard';
import { HistoryComponent } from '@components/history/history/history.component';
import { HistoryDetailComponent } from '@components/history/history-detail/history-detail.component';

export const historyRoutes: Routes = [
  {
    path: '',
    title: 'History',
    component: HistoryComponent,
  },
  {
    path: ':id',
    title: 'Payment Detail',
    component: HistoryDetailComponent,
    canActivate: [noCrawlerGuard],
  },
];
