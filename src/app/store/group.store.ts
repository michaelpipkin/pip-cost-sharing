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
  loaded: boolean;
  skipAutoSelect: boolean;
};

const initialState: GroupState = {
  allUserGroups: [],
  currentGroup: null,
  loaded: false,
  skipAutoSelect: false,
};

export const GroupStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setAllUserGroups: (groups: Group[]) => {
      patchState(store, { allUserGroups: groups, loaded: true });
    },
    removeGroup: (groupId: string) => {
      const updatedGroups = store
        .allUserGroups()
        .filter((group) => group.id !== groupId);
      patchState(store, { allUserGroups: updatedGroups });
    },
    setLoadedState: (loaded: boolean) => {
      patchState(store, { loaded });
    },
    clearAllUserGroups: () => {
      patchState(store, {
        allUserGroups: [],
        currentGroup: null,
        loaded: false,
      });
    },
    setCurrentGroup: (group: Group) => {
      patchState(store, { currentGroup: group });
    },
    clearCurrentGroup: (skipAutoSelect: boolean = false) => {
      patchState(store, { currentGroup: null, skipAutoSelect });
    },
    resetSkipAutoSelect: () => {
      patchState(store, { skipAutoSelect: false });
    },
  })),
  withComputed(({ allUserGroups }) => ({
    activeUserGroups: computed(() =>
      allUserGroups().filter(
        (g) =>
          ((g.active && g.userActiveInGroup) || g.userIsAdmin) && !g.archived
      )
    ),
    userAdminGroups: computed(() =>
      allUserGroups().filter((g) => g.userIsAdmin)
    ),
  }))
);
