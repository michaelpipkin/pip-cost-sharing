import { computed } from '@angular/core';
import { Expense } from '@models/expense';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

type ExpenseState = {
  groupExpenses: Expense[];
};

const initialState: ExpenseState = {
  groupExpenses: [],
};

export const ExpenseStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setGroupExpenses: (expenses: Expense[]) => {
      patchState(store, { groupExpenses: expenses });
    },
    clearGroupExpenses: () => {
      patchState(store, { groupExpenses: [] });
    },
  })),
  withComputed(({ groupExpenses: expenses }) => ({
    unpaidGroupExpenses: computed(() => expenses().filter((e) => !e.paid)),
  }))
);
