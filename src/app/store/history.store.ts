import { History } from '@models/history';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type HistoryState = {
  groupHistory: History[];
  loaded: boolean;
};

const initialState: HistoryState = {
  groupHistory: [],
  loaded: false,
};

export const HistoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setHistory: (history: History[]) => {
      patchState(store, { groupHistory: history, loaded: true });
    },
    clearHistory: () => {
      patchState(store, { groupHistory: [], loaded: false });
    },
  }))
);
