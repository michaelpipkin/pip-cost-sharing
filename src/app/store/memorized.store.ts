import { Memorized } from '@models/memorized';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type MemorizedState = {
  memorizedExpenses: Memorized[];
};

const initialState: MemorizedState = {
  memorizedExpenses: [],
};

export const MemorizedStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setMemorizedExpenses: (memorizedExpenses: Memorized[]) => {
      patchState(store, { memorizedExpenses: memorizedExpenses });
    },
    clearMemorizedExpenses: () => {
      patchState(store, { memorizedExpenses: [] });
    },
  }))
);
