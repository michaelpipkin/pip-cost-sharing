import { computed } from '@angular/core';
import { User } from '@models/user';
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
  isDemoMode: boolean;
};

const initialState: UserState = {
  user: null,
  isGoogleUser: false,
  isDemoMode: false,
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
    setIsDemoMode: (isDemoMode: boolean) =>
      patchState(store, { isDemoMode: isDemoMode }),
  })),
  withComputed(({ user }) => ({
    isLoggedIn: computed(() => !!user()),
  }))
);
