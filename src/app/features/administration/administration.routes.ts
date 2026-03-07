import { Routes } from '@angular/router';
import { groupGuard } from '@features/auth/guards.guard';
import { CategoriesComponent } from '@features/categories/categories/categories.component';
import { GroupsComponent } from '@features/groups/groups/groups.component';
import { MembersComponent } from '@features/members/members/members.component';

export const administrationRoutes: Routes = [
  {
    path: 'groups',
    title: 'Groups',
    component: GroupsComponent,
  },
  {
    path: 'members',
    title: 'Members',
    component: MembersComponent,
    canActivate: [groupGuard],
  },
  {
    path: 'categories',
    title: 'Categories',
    component: CategoriesComponent,
    canActivate: [groupGuard],
  },
];
