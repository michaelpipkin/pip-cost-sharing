import { Routes } from '@angular/router';
import { AboutComponent } from '@features/about/about.component';
import {
  adminGuard,
  authGuard,
  groupGuard,
  loggedInGuard,
} from '@features/auth/guards.guard';
import { DemoShellComponent } from '@features/demo/demo-shell.component';
import { HelpComponent } from '@features/help/help.component';
import { HomeComponent } from '@features/home/home.component';

export const appRoutes: Routes = [
  {
    path: '',
    title: 'Home',
    component: HomeComponent,
    data: {
      description:
        'PipSplit makes it effortless to track and split shared expenses with unlimited groups. Free for roommates, friends, and group trips — no account needed to try it.',
      ogTitle: 'PipSplit – Fair Expense Splitting Made Easy',
    },
  },
  {
    path: 'home',
    title: 'Home',
    component: HomeComponent,
    data: {
      description:
        'PipSplit makes it effortless to track and split shared expenses with unlimited groups. Free for roommates, friends, and group trips — no account needed to try it.',
      ogTitle: 'PipSplit – Fair Expense Splitting Made Easy',
    },
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('@features/auth/auth.routes').then((m) => m.authRoutes),
  },
  // Backward compatibility redirects
  { path: 'groups', redirectTo: 'administration/groups' },
  { path: 'members', redirectTo: 'administration/members' },
  { path: 'categories', redirectTo: 'administration/categories' },
  {
    path: 'administration',
    loadChildren: () =>
      import('@features/administration/administration.routes').then(
        (m) => m.administrationRoutes
      ),
    canActivate: [authGuard],
  },
  {
    path: 'expenses',
    loadChildren: () =>
      import('@features/expenses/expenses.routes').then(
        (m) => m.expensesRoutes
      ),
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'memorized',
    loadChildren: () =>
      import('@features/memorized/memorized.routes').then(
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
      import('@features/analysis/analysis.routes').then(
        (m) => m.analysisRoutes
      ),
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'help',
    title: 'Help',
    component: HelpComponent,
    data: {
      description:
        'Get answers to common questions about PipSplit. Learn how to create groups, add expenses, split costs, and track who owes what.',
      ogTitle: 'Help Center – PipSplit',
    },
  },
  {
    path: 'about',
    title: 'About Us',
    component: AboutComponent,
    data: {
      description:
        'PipSplit is a free expense-sharing app for any group. Split costs with unlimited members, track who owes what, and settle up quickly — for roommates, trips, and more.',
      ogTitle: 'About PipSplit – Free Expense Sharing App',
    },
  },
  {
    path: 'split',
    loadChildren: () =>
      import('@features/split/split.routes').then((m) => m.splitRoutes),
  },
  {
    path: 'demo',
    component: DemoShellComponent,
    loadChildren: () =>
      import('@features/demo/demo.routes').then((m) => m.demoRoutes),
    canActivate: [loggedInGuard],
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('@features/admin/admin.routes').then((m) => m.adminRoutes),
    canActivate: [authGuard, adminGuard],
  },
  { path: '**', redirectTo: '' },
];
