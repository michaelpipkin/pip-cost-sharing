import { computed } from '@angular/core';
import { Category } from '@models/category';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

type CategoryState = {
  groupCategories: Category[];
  loaded: boolean;
};

const initialState: CategoryState = {
  groupCategories: [],
  loaded: false,
};

export const CategoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setGroupCategories: (categories: Category[]) => {
      patchState(store, { groupCategories: categories, loaded: true });
    },
    clearGroupCategories: () => {
      patchState(store, { groupCategories: [], loaded: false });
    },
  })),
  withComputed(({ groupCategories }) => ({
    activeGroupCategories: computed(() =>
      groupCategories().filter((c) => c.active)
    ),
  }))
);
