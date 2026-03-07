import { Routes } from '@angular/router';
import { noCrawlerGuard } from '@features/auth/guards.guard';
import { HistoryComponent } from '@features/history/history/history.component';
import { HistoryDetailComponent } from '@features/history/history-detail/history-detail.component';

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
