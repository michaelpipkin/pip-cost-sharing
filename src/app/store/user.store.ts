import { computed } from '@angular/core';
import { Group } from '@models/group';
import { User } from '@models/user';
import { DocumentReference } from 'firebase/firestore';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

type UserState = {
  user: User | null;
  isGoogleUser: boolean;
  isEmailConfirmed: boolean;
  defaultGroupRef?: DocumentReference<Group> | null;
};

const initialState: UserState = {
  user: null,
  isGoogleUser: false,
  isEmailConfirmed: false,
  defaultGroupRef: null,
};

export const UserStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    updateUser: (changes: Partial<User>) => {
      const currentUser = store.user();
      if (currentUser) {
        patchState(store, { user: { ...currentUser, ...changes } });
      }
    },
    clearUser: () => {
      patchState(store, {
        user: null,
        isGoogleUser: false,
        isEmailConfirmed: false,
        defaultGroupRef: null,
      });
    },
    initUser: (
      user: User,
      isGoogleUser: boolean,
      isEmailConfirmed: boolean
    ) => {
      patchState(store, {
        user,
        isGoogleUser,
        isEmailConfirmed,
      });
    },
    setIsGoogleUser: (isGoogleUser: boolean) =>
      patchState(store, { isGoogleUser: isGoogleUser }),
    setIsEmailConfirmed: (isEmailConfirmed: boolean) =>
      patchState(store, { isEmailConfirmed: isEmailConfirmed }),
  })),
  withComputed(({ user, isGoogleUser, isEmailConfirmed }) => ({
    isLoggedIn: computed(() => !!user()),
    isValidUser: computed(() => isGoogleUser() || isEmailConfirmed()),
  }))
);
