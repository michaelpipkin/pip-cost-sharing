import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { ProfileComponent } from './auth/profile/profile.component';
import { CategoriesComponent } from './categories/categories/categories.component';
import { ExpensesComponent } from './expenses/expenses/expenses.component';
import { MemorizedComponent } from './expenses/memorized/memorized.component';
import { SummaryComponent } from './expenses/summary/summary.component';
import { GroupsComponent } from './groups/groups/groups.component';
import { HelpComponent } from './help/help/help.component';
import { MembersComponent } from './members/members/members.component';
import {
  canActivate,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/compat/auth-guard';

const authGuard = () => redirectUnauthorizedTo(['login']);
const loggedInGuard = () => redirectLoggedInTo(['profile']);

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/groups' },
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
  },
  {
    path: 'categories',
    title: 'Categories',
    component: CategoriesComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'expenses',
    title: 'Expenses',
    component: ExpensesComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'memorized',
    title: 'Memorized',
    component: MemorizedComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'summary',
    title: 'Summary',
    component: SummaryComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'profile',
    title: 'Profile',
    component: ProfileComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'help',
    title: 'Help',
    component: HelpComponent,
    ...canActivate(authGuard),
  },
  { path: '**', redirectTo: '/groups' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
