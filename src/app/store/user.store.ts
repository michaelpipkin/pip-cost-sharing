import { computed } from '@angular/core';
import { User } from '@models/user';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

/**
 * A login email change that has just been written to the user's profile
 * (from a non-empty old address to a different one), waiting for the app
 * shell to offer to update the user's group member emails to match.
 */
export type GroupEmailPrompt = {
  uid: string;
  oldEmail: string;
  newEmail: string;
};

type UserState = {
  user: User | null;
  isGoogleUser: boolean;
  isEmailConfirmed: boolean;
  // Deliberately survives clearUser(): a confirmed email change often ends
  // the session, and the offer is made after the user signs back in.
  groupEmailPrompt: GroupEmailPrompt | null;
};

const initialState: UserState = {
  user: null,
  isGoogleUser: false,
  isEmailConfirmed: false,
  groupEmailPrompt: null,
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
    setGroupEmailPrompt: (groupEmailPrompt: GroupEmailPrompt | null) =>
      patchState(store, { groupEmailPrompt }),
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
