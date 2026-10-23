import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { MemberService } from '@services/member.service';
import { callableError } from '@utils/callable-error.util';

type ErrorOutcome =
  | 'invalid'
  | 'unlinked'
  | 'duplicate'
  | 'wrong-account'
  | 'unverified'
  | 'inactive'
  | 'unavailable'
  | 'failed';
type Outcome = 'confirming' | 'confirmed' | ErrorOutcome;

const ERROR_MESSAGES: Record<ErrorOutcome, string> = {
  invalid:
    "This link has expired or was already used. Request a new one from the group's Members page.",
  unlinked:
    "You're no longer linked to this group membership, so the change can't be applied.",
  duplicate: 'Another member of this group already uses that address.',
  'wrong-account': 'Sign in with the account that requested this change.',
  unverified: 'Verify your login email first.',
  inactive:
    "You're no longer an active member of this group, so the change can't be applied.",
  unavailable:
    "Couldn't check your account right now. Please try the link again.",
  failed:
    'Something went wrong - your group email could not be confirmed. Please try the link again.',
};

/**
 * confirmMemberEmailChange's refusals, by code and the stable message the
 * server sends with it (functions/src/member-email.ts; the two projects
 * share no module, so the messages are repeated here). Anything else is
 * 'failed': no guessing from the code alone.
 */
const SERVER_OUTCOMES: Record<string, ErrorOutcome> = {
  'functions/failed-precondition|This link has expired or was already used.':
    'invalid',
  'functions/failed-precondition|This group membership is no longer linked to your account.':
    'unlinked',
  'functions/already-exists|A member with this email address already exists in the group.':
    'duplicate',
  'functions/permission-denied|Sign in with the account that requested this change.':
    'wrong-account',
  'functions/permission-denied|Verify your login email first.': 'unverified',
  'functions/permission-denied|User must be an active member of the group':
    'inactive',
  // The Auth lookup failed (an outage); the link is still unused.
  "functions/unavailable|Couldn't check your account right now. Please try again.":
    'unavailable',
};

/**
 * The page a group email confirmation link opens (Plan 4 B19): edit-member's
 * requestMemberEmailChange mails `/auth/confirm-group-email?token=...` to the
 * new address, and this page applies it once through
 * confirmMemberEmailChange. A separate route rather than a mode of
 * account-action, which Firebase's own action links own. The route's
 * authGuard requires a signed-in, verified user (the token is tied to the
 * account that asked).
 */
@Component({
  selector: 'app-confirm-group-email',
  imports: [MatButtonModule, MatCardModule, MatIconModule, RouterLink],
  templateUrl: './confirm-group-email.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmGroupEmailComponent {
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly memberService = inject(MemberService);
  protected readonly loading = inject(LoadingService);

  protected readonly membersPath = ROUTE_PATHS.ADMIN_MEMBERS;
  protected readonly outcome = signal<Outcome>('confirming');
  protected readonly email = signal('');

  constructor() {
    afterNextRender(() => this.#confirm());
  }

  protected readonly errorMessage = computed(() => {
    const outcome = this.outcome();
    return outcome === 'confirming' || outcome === 'confirmed'
      ? ''
      : ERROR_MESSAGES[outcome];
  });

  async #confirm(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.outcome.set('invalid');
      return;
    }
    // Take the token out of the URL at once (page-view analytics and ad
    // scripts record page URLs). It is bound to this account and works
    // once, but it needn't linger in history either.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
    this.loading.loadingOn();
    try {
      const { email } = await this.memberService.confirmMemberEmailChange(token);
      this.email.set(email);
      this.outcome.set('confirmed');
    } catch (error) {
      const { code, message } = callableError(error);
      // MemberService logs any code it does not expect. An expected code
      // with a message this page doesn't know (only possible from a newer
      // server) is not logged; it shows the generic failure.
      this.outcome.set(SERVER_OUTCOMES[`${String(code)}|${message}`] ?? 'failed');
    } finally {
      this.loading.loadingOff();
    }
  }
}
