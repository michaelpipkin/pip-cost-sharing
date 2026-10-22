import { inject, Injectable } from '@angular/core';
import { AnalyticsService } from '@services/analytics.service';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { appCheckTokenReady } from '../app-check';

interface LinkInvitedMembersResponse {
  membersLinked: number;
}

// Links unlinked invited-member records to a user's account via the
// linkInvitedMembers callable, which is App Check-enforced. The callable
// can fire soon after a cold boot (UserService.updateUserEmailAndLinkMembers
// after verification, GroupsComponent on page load), racing App Check's
// async first token fetch - the Firebase SDK soft-fails and sends the request with no App
// Check header if a token isn't ready yet, and the function rejects with
// 401. Gating on appCheckTokenReady() avoids firing a guaranteed-to-fail
// request; a skipped attempt is safe because the Groups page tries again on
// every load.
//
// The callable links by the caller's own VERIFIED sign-in address, read from
// the ID token server-side; no email is sent (trusting a client-supplied one
// let anyone claim another person's invites). Callers refresh the ID token
// first when the address was just verified or changed.
@Injectable({
  providedIn: 'root',
})
export class MemberLinkService {
  protected readonly functions = inject(getFunctions);
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(AnalyticsService);

  // Returns the number of member records linked, or null if the call was
  // skipped because no App Check token became available in time.
  async linkInvitedMembers(): Promise<number | null> {
    const tokenResult = await appCheckTokenReady();
    if (!tokenResult.ready) {
      const reasonDetail = tokenResult.detail
        ? `${tokenResult.reason}: ${tokenResult.detail}`
        : tokenResult.reason;
      this.analytics.logError(
        'Member Link Service',
        'linkInvitedMembers',
        'Skipped: App Check token unavailable',
        `${this.auth.currentUser?.email ?? 'unknown user'} (${reasonDetail})`
      );
      return null;
    }

    try {
      const linkInvitedMembers = httpsCallable<
        void,
        LinkInvitedMembersResponse
      >(this.functions, 'linkInvitedMembers');
      const { data } = await linkInvitedMembers();
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
