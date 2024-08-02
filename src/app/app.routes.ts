import { Routes } from '@angular/router';
import { groupGuard } from '@components/auth/group.guard';
import { LoginComponent } from '@components/auth/login/login.component';
import { ProfileComponent } from '@components/auth/profile/profile.component';
import { CategoriesComponent } from '@components/categories/categories/categories.component';
import { categoriesResolver } from '@components/categories/categories/categories.resolver';
import { ExpensesComponent } from '@components/expenses/expenses/expenses.component';
import { expensesResolver } from '@components/expenses/expenses/expenses.resolver';
import { GroupsComponent } from '@components/groups/groups/groups.component';
import { HomeComponent } from '@components/home/home.component';
import { MembersComponent } from '@components/members/members/members.component';
import { MemorizedComponent } from '@components/memorized/memorized/memorized.component';
import { SummaryComponent } from '@components/summary/summary/summary.component';
import {
  canActivate,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/auth-guard';

const authGuard = () => redirectUnauthorizedTo(['login']);
const loggedInGuard = () => redirectLoggedInTo(['profile']);

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/home' },
  {
    path: 'home',
    title: 'Home',
    component: HomeComponent,
  },
  {
    path: 'login',
    title: 'Login',
    component: LoginComponent,
    ...canActivate(loggedInGuard),
  },
  {
    path: 'groups',
    title: 'Groups',
    component: GroupsComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'members',
    title: 'Members',
    component: MembersComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'categories',
    title: 'Categories',
    component: CategoriesComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
    resolve: {
      categories: categoriesResolver,
    },
  },
  {
    path: 'expenses',
    title: 'Expenses',
    component: ExpensesComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
    resolve: {
      expenses: expensesResolver,
    },
  },
  {
    path: 'memorized',
    title: 'Memorized',
    component: MemorizedComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'summary',
    title: 'Summary',
    component: SummaryComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'profile',
    title: 'Profile',
    component: ProfileComponent,
    ...canActivate(authGuard),
  },
  { path: '**', redirectTo: '/home' },
];
