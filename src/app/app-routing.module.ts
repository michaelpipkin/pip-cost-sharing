import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { GroupDetailsComponent } from './groups/group-details/group-details.component';
import { GroupsComponent } from './groups/groups/groups.component';
import {
  canActivate,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/compat/auth-guard';

const authGuard = () => redirectUnauthorizedTo(['login']);
const loggedInGuard = () => redirectLoggedInTo(['members']);

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/members' },
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
    path: 'group-details',
    component: GroupDetailsComponent,
    ...canActivate(authGuard),
  },
  // {
  //   path: 'categories',
  //   component: CategoriesComponent,
  //   ...canActivate(authGuard),
  // }
  { path: '**', redirectTo: '/groups' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
