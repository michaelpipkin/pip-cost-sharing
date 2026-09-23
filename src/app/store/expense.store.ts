import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type ExpenseState = {
  groupHasExpenses: boolean;
};

const initialState: ExpenseState = {
  groupHasExpenses: false,
};

export const ExpenseStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setGroupHasExpenses: (hasExpenses: boolean) => {
      patchState(store, { groupHasExpenses: hasExpenses });
    },
    clearGroupExpenses: () => {
      patchState(store, { groupHasExpenses: false });
    },
  }))
);
