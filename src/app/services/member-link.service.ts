import { inject, Injectable } from '@angular/core';
import { AnalyticsService } from '@services/analytics.service';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { appCheckTokenReady } from '../app-check';

interface LinkInvitedMembersResponse {
  membersLinked: number;
}

// Links unlinked invited-member records to a user's account via the
// linkInvitedMembers callable, which is App Check-enforced. The callable
// fires at cold boot (see UserService.createUserIfNotExists /
// updateUserEmailAndLinkMembers), racing App Check's async first token
// fetch - the Firebase SDK soft-fails and sends the request with no App
// Check header if a token isn't ready yet, and the function rejects with
// 401. Gating on appCheckTokenReady() avoids firing a guaranteed-to-fail
// request; a skipped attempt is safe because GroupService retries once
// automatically for any user who ends up with zero groups.
@Injectable({
  providedIn: 'root',
})
export class MemberLinkService {
  protected readonly functions = inject(getFunctions);
  protected readonly analytics = inject(AnalyticsService);

  // Returns the number of member records linked, or null if the call was
  // skipped because no App Check token became available in time.
  async linkInvitedMembers(email: string): Promise<number | null> {
    const tokenResult = await appCheckTokenReady();
    if (!tokenResult.ready) {
      const reasonDetail = tokenResult.detail
        ? `${tokenResult.reason}: ${tokenResult.detail}`
        : tokenResult.reason;
      this.analytics.logError(
        'Member Link Service',
        'linkInvitedMembers',
        'Skipped: App Check token unavailable',
        `${email} (${reasonDetail})`
      );
      return null;
    }

    try {
      const linkInvitedMembers = httpsCallable<
        { email: string },
        LinkInvitedMembersResponse
      >(this.functions, 'linkInvitedMembers');
      const { data } = await linkInvitedMembers({ email });
      return data.membersLinked;
    } catch (error) {
      this.analytics.logError(
        'Member Link Service',
        'linkInvitedMembers',
        'Failed to link invited members',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
