import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GroupService } from '@services/group.service';

export const groupGuard: CanActivateFn = (_route, _state) => {
  const groupService = inject(GroupService);
  const router = inject(Router);
  if (groupService.currentGroup() === null) {
    router.navigate['/groups'];
    return false;
  }
  return true;
};
