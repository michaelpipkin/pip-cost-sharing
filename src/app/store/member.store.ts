import { computed } from '@angular/core';
import { Member } from '@models/member';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

type MemberState = {
  currentMember: Member | null;
  groupMembers: Member[];
};

const initialState: MemberState = {
  currentMember: null,
  groupMembers: [],
};

export const MemberStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setCurrentMember: (member: Member) => {
      patchState(store, { currentMember: member });
    },
    clearCurrentMember: () => {
      patchState(store, { currentMember: null });
    },
    setGroupMembers: (members: Member[]) => {
      patchState(store, { groupMembers: members });
    },
  })),
  withComputed(({ groupMembers }) => ({
    activeGroupMembers: computed(() => groupMembers().filter((m) => m.active)),
  }))
);
