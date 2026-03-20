import { AdminStatistics } from '@models/admin-statistics';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type StatisticsState = {
  statistics: AdminStatistics | null;
  loaded: boolean;
};

const initialState: StatisticsState = {
  statistics: null,
  loaded: false,
};

export const StatisticsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setStatistics: (statistics: AdminStatistics) => {
      patchState(store, { statistics, loaded: true });
    },
    clearStatistics: () => {
      patchState(store, { statistics: null, loaded: false });
    },
  }))
);
