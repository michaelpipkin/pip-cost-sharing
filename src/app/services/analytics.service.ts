import { Injectable } from '@angular/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
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
}
