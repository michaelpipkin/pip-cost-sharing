import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Memorized } from '@models/memorized';
import { MemorizedService } from '@services/memorized.service';
import { GroupStore } from '@store/group.store';

export const editMemorizedResolver: ResolveFn<Memorized> = (route) => {
  const memorizedService = inject(MemorizedService);
  const groupStore = inject(GroupStore);
  const memorizedId = route.paramMap.get('id')!;
  const groupId = groupStore.currentGroup()!.id;

  return memorizedService.getMemorized(groupId, memorizedId);
};
