import { inject, Injectable } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AnalyticsService } from './analytics.service';

export interface SendGroupInviteRequest {
  groupId: string;
  memberId: string;
}

export interface SendGroupInviteResponse {
  success: boolean;
  sentTo: string;
  sendCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class InviteService {
  protected readonly functions = inject(getFunctions);
  protected readonly analytics = inject(AnalyticsService);

  /**
   * Ask the server to email an app invitation to an unregistered group member.
   * All validation (admin rights, member state, 24h cooldown) is enforced in
   * the `sendGroupInvite` Cloud Function; client-side checks are UX only.
   */
  async sendGroupInvite(
    groupId: string,
    memberId: string
  ): Promise<SendGroupInviteResponse> {
    try {
      const sendGroupInviteFn = httpsCallable<
        SendGroupInviteRequest,
        SendGroupInviteResponse
      >(this.functions, 'sendGroupInvite');

      const result = await sendGroupInviteFn({ groupId, memberId });
      return result.data;
    } catch (error) {
      this.analytics.logError(
        'Invite Service',
        'sendGroupInvite',
        'Failed to send group invite',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
