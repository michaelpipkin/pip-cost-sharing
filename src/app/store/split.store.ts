import { Split } from '@models/split';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type SplitState = {
  unpaidSplits: Split[];
  loaded: boolean;
};

const initialState: SplitState = {
  unpaidSplits: [],
  loaded: false,
};

export const SplitStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setSplits: (splits: Split[]) => {
      patchState(store, { unpaidSplits: splits, loaded: true });
    },
    clearSplits: () => {
      patchState(store, { unpaidSplits: [], loaded: false });
    },
  }))
);
