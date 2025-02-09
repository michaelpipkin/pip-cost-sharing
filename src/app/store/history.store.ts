import { History } from '@models/history';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type HistoryState = {
  groupHistory: History[];
};

const initialState: HistoryState = {
  groupHistory: [],
};

export const HistoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setHistory: (history: History[]) => {
      patchState(store, { groupHistory: history });
    },
    clearHistory: () => {
      patchState(store, { groupHistory: [] });
    },
  }))
);
