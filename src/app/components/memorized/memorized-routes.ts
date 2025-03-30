import { Routes } from '@angular/router';
import { authGuard, groupGuard } from '@components/auth/guards.guard';
import { AddMemorizedComponent } from './add-memorized/add-memorized.component';
import { editMemorizedResolver } from './edit-memorized.resolver';
import { EditMemorizedComponent } from './edit-memorized/edit-memorized.component';
import { MemorizedComponent } from './memorized/memorized.component';

export const memorizedRoutes: Routes = [
  {
    path: 'memorized',
    title: 'Memorized',
    component: MemorizedComponent,
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'memorized/add',
    title: 'Add Memorized Expense',
    component: AddMemorizedComponent,
    canActivate: [authGuard, groupGuard],
  },
  {
    path: 'memorized/:id',
    title: 'Edit Memorized Expense',
    component: EditMemorizedComponent,
    resolve: { memorized: editMemorizedResolver },
    canActivate: [authGuard, groupGuard],
  },
];
