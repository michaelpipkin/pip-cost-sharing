import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Memorized } from '@models/memorized';
import { GroupService } from '@services/group.service';
import { MemorizedService } from '@services/memorized.service';

export const editMemorizedResolver: ResolveFn<Memorized> = (route) => {
  const memorizedService = inject(MemorizedService);
  const groupService = inject(GroupService);
  const memorizedId = route.paramMap.get('id');
  const groupId = groupService.currentGroup().id;

  return memorizedService.getMemorized(groupId, memorizedId);
};
