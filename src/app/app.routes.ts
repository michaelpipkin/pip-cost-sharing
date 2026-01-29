import { Routes } from '@angular/router';
import { AboutComponent } from '@components/about/about.component';
import {
  adminGuard,
  authGuard,
  groupGuard,
  loggedInGuard,
} from '@components/auth/guards.guard';
import { HelpComponent } from '@components/help/help.component';
import { HomeComponent } from '@components/home/home.component';

export const appRoutes: Routes = [
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
  // Backward compatibility redirects
  { path: 'groups', redirectTo: 'administration/groups' },
  { path: 'members', redirectTo: 'administration/members' },
  { path: 'categories', redirectTo: 'administration/categories' },
  {
    path: 'administration',
    loadChildren: () =>
      import('@components/administration/administration.routes').then(
        (m) => m.administrationRoutes
      ),
    canActivate: [authGuard],
  },
  {
    path: 'expenses',
    loadChildren: () =>
      import('@components/expenses/expenses.routes').then(
        (m) => m.expensesRoutes
      ),
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'memorized',
    loadChildren: () =>
      import('@components/memorized/memorized.routes').then(
        (m) => m.memorizedRoutes
      ),
    canActivate: [authGuard, groupGuard],
  },
  // Backward compatibility redirects
  { path: 'summary', redirectTo: 'analysis/summary' },
  { path: 'history', redirectTo: 'analysis/history' },
  {
    path: 'analysis',
    loadChildren: () =>
      import('@components/analysis/analysis.routes').then(
        (m) => m.analysisRoutes
      ),
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'help',
    title: 'Help',
    component: HelpComponent,
  },
  {
    path: 'about',
    title: 'About Us',
    component: AboutComponent,
  },
  {
    path: 'split',
    loadChildren: () =>
      import('@components/split/split.routes').then((m) => m.splitRoutes),
  },
  {
    path: 'demo',
    loadChildren: () =>
      import('@components/demo/demo.routes').then((m) => m.demoRoutes),
    canActivate: [loggedInGuard],
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('@components/admin/admin.routes').then((m) => m.adminRoutes),
    canActivate: [authGuard, adminGuard],
  },
  { path: '**', redirectTo: '' },
];
