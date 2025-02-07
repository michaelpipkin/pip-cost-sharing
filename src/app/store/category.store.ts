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
};

const initialState: CategoryState = {
  groupCategories: [],
};

export const CategoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setGroupCategories: (categories: Category[]) => {
      patchState(store, { groupCategories: categories });
    },
    clearGroupCategories: () => {
      patchState(store, { groupCategories: [] });
    },
  })),
  withComputed(({ groupCategories }) => ({
    activeGroupCategories: computed(() =>
      groupCategories().filter((c) => c.active)
    ),
  }))
);
