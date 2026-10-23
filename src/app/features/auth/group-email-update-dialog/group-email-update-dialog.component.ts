import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import {
  memberEmailUpdateMessage,
  MemberService,
} from '@services/member.service';
import { UserStore } from '@store/user.store';
import {
  AUTH_LOOKUP_UNAVAILABLE,
  isAuthLookupUnavailable,
  isInvalidLoginEmailRefusal,
  isUnverifiedLoginRefusal,
  LOGIN_EMAIL_INVALID_MESSAGE,
  VERIFY_LOGIN_EMAIL,
} from '@utils/callable-error.util';

export interface GroupEmailUpdateDialogData {
  oldEmail: string;
  newEmail: string;
  /** N: memberships whose email is not the new login email. */
  total: number;
  /** M: of those, memberships still on the old login email. */
  onOldEmail: number;
  /** K: of those, memberships with no email address at all. */
  blank: number;
}

/**
 * Offered after a login-email change (opened by AppComponent): moves the
 * user's group member emails to the new login email, all of them or only
 * those still on the old one. Closes itself once an update succeeds, and stays
 * open after a failure so the user can retry the same choice. Closes quietly if
 * the session ends while it is open.
 */
@Component({
  selector: 'app-group-email-update-dialog',
  templateUrl: './group-email-update-dialog.component.html',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupEmailUpdateDialogComponent {
  protected readonly data = inject<GroupEmailUpdateDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef =
    inject<MatDialogRef<GroupEmailUpdateDialogComponent>>(MatDialogRef);
  protected readonly memberService = inject(MemberService);
  protected readonly userStore = inject(UserStore);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly appCheckErrorHandler = inject(AppCheckErrorHandlerService);

  /** Memberships on an address the user set for that group. */
  protected readonly other =
    this.data.total - this.data.onOldEmail - this.data.blank;
  /** "Update old email only" differs from "Update all" only in this case. */
  protected readonly showOldOnly =
    this.data.onOldEmail > 0 && this.data.onOldEmail < this.data.total;
  protected readonly oldLine = this.#countLine(
    this.data.onOldEmail,
    'still uses',
    'still use',
    `your old login email, ${this.data.oldEmail}.`
  );
  protected readonly otherLine = this.#countLine(
    this.other,
    'uses',
    'use',
    'a different address you set for that group.'
  );
  protected readonly blankLine = this.#countLine(
    this.data.blank,
    'has',
    'have',
    'no email address.'
  );

  constructor() {
    effect(() => {
      if (!this.userStore.user()) untracked(() => this.dialogRef.close());
    });
  }

  #countLine(count: number, singular: string, plural: string, rest: string) {
    const noun = count === 1 ? 'membership' : 'memberships';
    return `${count} ${noun} ${count === 1 ? singular : plural} ${rest}`;
  }

  updateAll(): Promise<void> {
    return this.#update(false);
  }

  updateOldOnly(): Promise<void> {
    return this.#update(true);
  }

  async #update(onlyOld: boolean): Promise<void> {
    this.loading.loadingOn();
    let finished = true;
    try {
      // The session ended: there is nobody to update (the dialog closes).
      if (!this.userStore.user()) return;
      // The server moves the memberships to the account's verified login
      // email (updateMemberEmails), all of them or only those on the old one.
      const result = await this.memberService.updateAllMemberEmails(
        onlyOld ? this.data.oldEmail : undefined
      );
      this.#notify(memberEmailUpdateMessage(result));
    } catch (error) {
      // Retrying can't help with these two, so the dialog closes.
      if (isUnverifiedLoginRefusal(error)) {
        this.#notify(VERIFY_LOGIN_EMAIL);
      } else if (isInvalidLoginEmailRefusal(error)) {
        this.#notify(LOGIN_EMAIL_INVALID_MESSAGE);
      } else if (isAuthLookupUnavailable(error)) {
        // An Auth outage on the server: the same choice can be retried.
        finished = false;
        this.#notify(AUTH_LOOKUP_UNAVAILABLE);
      } else {
        // MemberService logs unexpected failures. An App Check refusal (the
        // callable enforces it) gets the help dialog over this one.
        finished = false;
        this.appCheckErrorHandler.handle(
          error,
          'Something went wrong - could not update member emails'
        );
      }
    } finally {
      this.loading.loadingOff();
      // A failure writes nothing and leaves the dialog open, so the same
      // choice can be retried.
      if (finished) this.dialogRef.close();
    }
  }

  #notify(message: string): void {
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message },
    });
  }
}
