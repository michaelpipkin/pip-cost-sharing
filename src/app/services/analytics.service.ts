import { inject, Injectable } from '@angular/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  protected readonly fs = inject(getFirestore);

  async logEvent(
    name: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    try {
      await FirebaseAnalytics.logEvent({ name, params });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  async logError(
    component: string,
    action: string,
    message: string,
    error?: string
  ): Promise<void> {
    const params: Record<string, unknown> = { component, action, message };
    if (error !== undefined) params['error'] = error;

    FirebaseAnalytics.logEvent({ name: 'app_error', params }).catch((e) =>
      console.error('Analytics logError (GA) failed:', e)
    );

    addDoc(collection(this.fs, 'app_errors'), {
      ...params,
      timestamp: serverTimestamp(),
    }).catch((e) => console.error('Analytics logError (Firestore) failed:', e));
  }
}
