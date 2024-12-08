import {
  canActivate,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/auth-guard';
import { Routes } from '@angular/router';
import { groupGuard } from '@components/auth/group.guard';
import { LoginComponent } from '@components/auth/login/login.component';
import { ProfileComponent } from '@components/auth/profile/profile.component';
import { CategoriesComponent } from '@components/categories/categories/categories.component';
import { AddExpenseComponent } from '@components/expenses/add-expense/add-expense.component';
import { editExpenseResolver } from '@components/expenses/edit-expense.resolver';
import { EditExpenseComponent } from '@components/expenses/edit-expense/edit-expense.component';
import { ExpensesComponent } from '@components/expenses/expenses/expenses.component';
import { GroupsComponent } from '@components/groups/groups/groups.component';
import { HistoryComponent } from '@components/history/history/history.component';
import { HomeComponent } from '@components/home/home.component';
import { MembersComponent } from '@components/members/members/members.component';
import { AddMemorizedComponent } from '@components/memorized/add-memorized/add-memorized.component';
import { editMemorizedResolver } from '@components/memorized/edit-memorized.resolver';
import { EditMemorizedComponent } from '@components/memorized/edit-memorized/edit-memorized.component';
import { MemorizedComponent } from '@components/memorized/memorized/memorized.component';
import { SummaryComponent } from '@components/summary/summary/summary.component';

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
  },
  {
    path: 'expenses',
    title: 'Expenses',
    component: ExpensesComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'add-expense',
    title: 'Add Expense',
    component: AddExpenseComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'edit-expense/:id',
    title: 'Edit Expense',
    component: EditExpenseComponent,
    resolve: { expense: editExpenseResolver },
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'memorized',
    title: 'Memorized',
    component: MemorizedComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'add-memorized',
    title: 'Add Memorized Expense',
    component: AddMemorizedComponent,
    ...canActivate(authGuard),
    canActivate: [groupGuard],
  },
  {
    path: 'edit-memorized/:id',
    title: 'Edit Memorized Expense',
    component: EditMemorizedComponent,
    resolve: { memorized: editMemorizedResolver },
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
    path: 'history',
    title: 'History',
    component: HistoryComponent,
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
