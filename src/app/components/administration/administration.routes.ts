import { Routes } from '@angular/router';
import { CategoriesComponent } from '@components/categories/categories/categories.component';
import { GroupsComponent } from '@components/groups/groups/groups.component';
import { MembersComponent } from '@components/members/members/members.component';

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
  },
  {
    path: 'categories',
    title: 'Categories',
    component: CategoriesComponent,
  },
];