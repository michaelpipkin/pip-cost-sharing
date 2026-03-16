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
  groupHasExpenses: boolean;
  loaded: boolean;
};

const initialState: ExpenseState = {
  groupExpenses: [],
  groupHasExpenses: false,
  loaded: false,
};

export const ExpenseStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setGroupHasExpenses: (hasExpenses: boolean) => {
      patchState(store, { groupHasExpenses: hasExpenses });
    },
    setGroupExpenses: (expenses: Expense[]) => {
      patchState(store, { groupExpenses: expenses, loaded: true });
    },
    clearGroupExpenses: () => {
      patchState(store, { groupExpenses: [], loaded: false });
    },
  })),
  withComputed(({ groupExpenses: expenses }) => ({
    unpaidGroupExpenses: computed(() => expenses().filter((e) => !e.paid)),
  }))
);
