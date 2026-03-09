import { inject, Injectable } from '@angular/core';
import { MailDocument } from '@models/mail';
import { AnalyticsService } from '@services/analytics.service';
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class AdminMailService {
  protected readonly fs = inject(getFirestore);
  protected readonly analytics = inject(AnalyticsService);

  async getMailDocuments(limitCount = 200): Promise<MailDocument[]> {
    try {
      const mailQuery = query(
        collection(this.fs, 'mail'),
        orderBy('delivery.startTime', 'desc'),
        limit(limitCount)
      );
      const snapshot = await getDocs(mailQuery);
      return snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as MailDocument
      );
    } catch (error) {
      this.analytics.logEvent('app_error', {
        service: 'AdminMailService',
        method: 'getMailDocuments',
        message: 'Failed to load mail documents',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
