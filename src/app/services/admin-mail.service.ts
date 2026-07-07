import { inject, Injectable } from '@angular/core';
import { MailDocument } from '@models/mail';
import { AnalyticsService } from '@services/analytics.service';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  writeBatch,
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
      this.analytics.logError(
        'Admin Mail Service',
        'getMailDocuments',
        'Failed to load mail documents',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async deleteMailDocument(id: string): Promise<void> {
    try {
      await deleteDoc(doc(this.fs, 'mail', id));
    } catch (error) {
      this.analytics.logError(
        'Admin Mail Service',
        'deleteMailDocument',
        'Failed to delete mail document',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async deleteMailDocuments(ids: string[]): Promise<void> {
    try {
      const batch = writeBatch(this.fs);
      for (const id of ids) {
        batch.delete(doc(this.fs, 'mail', id));
      }
      await batch.commit();
    } catch (error) {
      this.analytics.logError(
        'Admin Mail Service',
        'deleteMailDocuments',
        'Failed to delete mail documents',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
