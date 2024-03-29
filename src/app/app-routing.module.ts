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
    component: LoginComponent,
    ...canActivate(loggedInGuard),
  },
  {
    path: 'groups',
    component: GroupsComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'members',
    component: MembersComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'categories',
    component: CategoriesComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'expenses',
    component: ExpensesComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'memorized',
    component: MemorizedComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'summary',
    component: SummaryComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'profile',
    component: ProfileComponent,
    ...canActivate(authGuard),
  },
  {
    path: 'help',
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
