import { computed } from '@angular/core';
import { Category } from '@models/category';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { DocumentReference } from 'firebase/firestore';

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
    getCategoryByRef: (categoryRef: DocumentReference<Category> | null) => {
      if (!categoryRef) return null;
      const categories = store.groupCategories();
      return categories.find((c) => c.ref.eq(categoryRef)) || null;
    },
  })),
  withComputed(({ groupCategories }) => ({
    activeGroupCategories: computed(() =>
      groupCategories().filter((c) => c.active)
    ),
  }))
);
