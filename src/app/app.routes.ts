import { Routes } from '@angular/router';
import { authGuard, groupGuard } from '@components/auth/guards.guard';
import { CategoriesComponent } from '@components/categories/categories/categories.component';
import { expensesRoutes } from '@components/expenses/expenses.routes';
import { GroupsComponent } from '@components/groups/groups/groups.component';
import { HelpComponent } from '@components/help/help.component';
import { HistoryComponent } from '@components/history/history/history.component';
import { HomeComponent } from '@components/home/home.component';
import { MembersComponent } from '@components/members/members/members.component';
import { memorizedRoutes } from '@components/memorized/memorized-routes';
import { SummaryComponent } from '@components/summary/summary/summary.component';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '' },
  {
    path: '',
    title: 'Home',
    component: HomeComponent,
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('@components/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'groups',
    title: 'Groups',
    component: GroupsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'members',
    title: 'Members',
    component: MembersComponent,
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'categories',
    title: 'Categories',
    component: CategoriesComponent,
    canActivate: [authGuard, groupGuard],
  },
  ...expensesRoutes,
  ...memorizedRoutes,
  {
    path: 'summary',
    title: 'Summary',
    component: SummaryComponent,
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'history',
    title: 'History',
    component: HistoryComponent,
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'help',
    title: 'Help',
    component: HelpComponent,
  },
  { path: '**', redirectTo: '' },
];
