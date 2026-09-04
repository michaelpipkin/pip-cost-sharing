import { AdminReportId, AdminReportResult } from '@models/admin-report';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

type ReportsState = {
  results: Partial<Record<AdminReportId, AdminReportResult>>;
};

const initialState: ReportsState = {
  results: {},
};

export const ReportsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    setResult: (reportId: AdminReportId, result: AdminReportResult) => {
      patchState(store, {
        results: { ...store.results(), [reportId]: result },
      });
    },
    clearResult: (reportId: AdminReportId) => {
      const results = { ...store.results() };
      delete results[reportId];
      patchState(store, { results });
    },
    clearAll: () => {
      patchState(store, { results: {} });
    },
  }))
);
