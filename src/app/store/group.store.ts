import { computed } from '@angular/core';
import { Group } from '@models/group';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

type GroupState = {
  allUserGroups: Group[];
  currentGroup: Group | null;
  adminGroupIds: string[];
};

const initialState: GroupState = {
  allUserGroups: [],
  currentGroup: null,
  adminGroupIds: [],
};

export const GroupStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setAllUserGroups: (groups: Group[]) => {
      patchState(store, { allUserGroups: groups });
    },
    clearAllUserGroups: () => {
      patchState(store, { allUserGroups: [] });
    },
    setCurrentGroup: (group: Group) => {
      patchState(store, { currentGroup: group });
    },
    clearCurrentGroup: () => {
      patchState(store, { currentGroup: null });
    },
    setAdminGroupIds: (ids: string[]) => {
      patchState(store, { adminGroupIds: ids });
    },
    clearAdminGroupIds: () => {
      patchState(store, { adminGroupIds: [] });
    },
  })),
  withComputed(({ allUserGroups, adminGroupIds }) => ({
    activeUserGroups: computed(() => allUserGroups().filter((g) => g.active)),
    userAdminGroups: computed(() =>
      allUserGroups().filter((g) => adminGroupIds().includes(g.id))
    ),
  }))
);
