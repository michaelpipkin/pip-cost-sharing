import { Memorized } from '@models/memorized';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type MemorizedState = {
  memorizedExpenses: Memorized[];
  loaded: boolean;
};

const initialState: MemorizedState = {
  memorizedExpenses: [],
  loaded: false,
};

export const MemorizedStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setMemorizedExpenses: (memorizedExpenses: Memorized[]) => {
      patchState(store, { memorizedExpenses: memorizedExpenses, loaded: true });
    },
    clearMemorizedExpenses: () => {
      patchState(store, { memorizedExpenses: [], loaded: false });
    },
  }))
);
