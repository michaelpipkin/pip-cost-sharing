import { Split } from '@models/split';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type SplitState = {
  unpaidSplits: Split[];
};

const initialState: SplitState = {
  unpaidSplits: [],
};

export const SplitStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setSplits: (splits: Split[]) => {
      patchState(store, { unpaidSplits: splits });
    },
    clearSplits: () => {
      patchState(store, { unpaidSplits: [] });
    },
  }))
);
