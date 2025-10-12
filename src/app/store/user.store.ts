import { computed } from '@angular/core';
import { Group } from '@models/group';
import { User } from '@models/user';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { DocumentReference } from 'firebase/firestore';

type UserState = {
  user: User | null;
  isGoogleUser: boolean;
  isEmailConfirmed: boolean;
  isDemoMode: boolean;
  defaultGroupRef?: DocumentReference<Group> | null;
};

const initialState: UserState = {
  user: null,
  isGoogleUser: false,
  isEmailConfirmed: false,
  isDemoMode: false,
  defaultGroupRef: null,
};

export const UserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setUser: (user: User) => {
      patchState(store, { user: user });
    },
    updateUser: (changes: Partial<User>) => {
      patchState(store, { user: { ...store.user(), ...changes } });
    },
    clearUser: () => {
      patchState(store, { user: null });
    },
    setIsGoogleUser: (isGoogleUser: boolean) =>
      patchState(store, { isGoogleUser: isGoogleUser }),
    setIsEmailConfirmed: (isEmailConfirmed: boolean) =>
      patchState(store, { isEmailConfirmed: isEmailConfirmed }),
    setIsDemoMode: (isDemoMode: boolean) =>
      patchState(store, { isDemoMode: isDemoMode }),
  })),
  withComputed(({ user, isGoogleUser, isEmailConfirmed }) => ({
    isLoggedIn: computed(() => !!user()),
    isValidUser: computed(() => isGoogleUser() || isEmailConfirmed()),
  }))
);
