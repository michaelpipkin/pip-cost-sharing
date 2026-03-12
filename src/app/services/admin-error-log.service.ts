import { inject, Injectable } from '@angular/core';
import { AppError } from '@models/app-error';
import { AnalyticsService } from '@services/analytics.service';
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class AdminErrorLogService {
  protected readonly fs = inject(getFirestore);
  protected readonly analytics = inject(AnalyticsService);

  async getAppErrors(startDate: Date, endDate: Date): Promise<AppError[]> {
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    try {
      const errorsQuery = query(
        collection(this.fs, 'app_errors'),
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        where('timestamp', '<=', Timestamp.fromDate(endOfDay)),
        orderBy('timestamp', 'desc'),
        limit(500)
      );
      const snapshot = await getDocs(errorsQuery);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as AppError);
    } catch (error) {
      this.analytics.logError(
        'Admin Error Log Service',
        'getAppErrors',
        'Failed to load app errors',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
