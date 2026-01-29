import { inject, Injectable } from '@angular/core';
import { AdminStatistics } from '@models/admin-statistics';
import { getFunctions, httpsCallable } from 'firebase/functions';

@Injectable({
  providedIn: 'root',
})
export class AdminStatisticsService {
  private readonly functions = inject(getFunctions);

  async getStatistics(): Promise<AdminStatistics> {
    const getStatsFn = httpsCallable<void, AdminStatistics>(
      this.functions,
      'getAdminStatistics'
    );
    const result = await getStatsFn();
    return result.data;
  }
}
