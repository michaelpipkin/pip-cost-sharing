import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { MemberService } from '@services/member.service';

type Outcome = 'confirming' | 'confirmed' | 'invalid' | 'wrong-account' | 'failed';

const ERROR_MESSAGES: Record<Exclude<Outcome, 'confirming' | 'confirmed'>, string> = {
  invalid:
    "This link has expired or was already used. Request a new one from the group's Members page.",
  'wrong-account': 'Sign in with the account that requested this change.',
  failed:
    'Something went wrong - your group email could not be confirmed. Please try the link again.',
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
  protected readonly memberService = inject(MemberService);
  protected readonly loading = inject(LoadingService);

  protected readonly membersPath = ROUTE_PATHS.ADMIN_MEMBERS;
  protected readonly outcome = signal<Outcome>('confirming');
  protected readonly email = signal('');

  constructor() {
    afterNextRender(() => this.#confirm());
  }

  protected errorMessage(): string {
    const outcome = this.outcome();
    return outcome === 'confirming' || outcome === 'confirmed'
      ? ''
      : ERROR_MESSAGES[outcome];
  }

  async #confirm(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.outcome.set('invalid');
      return;
    }
    this.loading.loadingOn();
    try {
      const { email } = await this.memberService.confirmMemberEmailChange(token);
      this.email.set(email);
      this.outcome.set('confirmed');
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'functions/failed-precondition') {
        this.outcome.set('invalid');
      } else if (code === 'functions/permission-denied') {
        this.outcome.set('wrong-account');
      } else {
        // MemberService has already logged the unexpected failure.
        this.outcome.set('failed');
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
