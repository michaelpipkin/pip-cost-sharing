import { computed } from '@angular/core';
import { Member } from '@models/member';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { DocumentReference } from 'firebase/firestore';

type MemberState = {
  currentMember: Member | null;
  groupMembers: Member[];
  loaded: boolean;
};

const initialState: MemberState = {
  currentMember: null,
  groupMembers: [],
  loaded: false,
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
      patchState(store, { groupMembers: members, loaded: true });
    },
    clearGroupMembers: () => {
      patchState(store, { groupMembers: [], loaded: false });
    },
    getMemberByRef: (ref: DocumentReference<Member> | null) => {
      if (!ref) return null;
      const members = store.groupMembers();
      return members.find((m) => m.ref.eq(ref)) || null;
    },
  })),
  withComputed(({ groupMembers }) => ({
    activeGroupMembers: computed(() => groupMembers().filter((m) => m.active)),
  }))
);
