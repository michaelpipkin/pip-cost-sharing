import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { MemberService } from '@services/member.service';
import { UserStore } from '@store/user.store';
import { verifiedTokenEmail } from '@utils/verified-token-email.util';
import { getAuth } from 'firebase/auth';

export interface GroupEmailUpdateDialogData {
  oldEmail: string;
  newEmail: string;
  /** N: memberships whose email is not the new login email. */
  total: number;
  /** M: of those, memberships still on the old login email. */
  onOldEmail: number;
}

/**
 * Offered after a login-email change (opened by AppComponent): moves the
 * user's group member emails to the new login email, all of them or only
 * those still on the old one. Closes itself once an update finishes or fails.
 */
@Component({
  selector: 'app-group-email-update-dialog',
  templateUrl: './group-email-update-dialog.component.html',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupEmailUpdateDialogComponent {
  protected readonly data = inject<GroupEmailUpdateDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject<MatDialogRef<GroupEmailUpdateDialogComponent>>(MatDialogRef);
  protected readonly auth = inject(getAuth);
  protected readonly memberService = inject(MemberService);
  protected readonly userStore = inject(UserStore);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  protected readonly other = this.data.total - this.data.onOldEmail;
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
    try {
      // The rules accept a linked member email only when it is the caller's
      // verified token address, so take it from a refreshed token, exactly
      // as Account > Profile's Sync does.
      const tokenEmail = await verifiedTokenEmail(this.auth);
      if (!tokenEmail) {
        this.#notify('Verify your login email first.');
        return;
      }
      const userRef = this.userStore.user()!.ref!;
      const count = onlyOld
        ? await this.memberService.updateAllMemberEmails(
            userRef,
            tokenEmail,
            this.data.oldEmail
          )
        : await this.memberService.updateAllMemberEmails(userRef, tokenEmail);
      this.#notify(
        count > 0
          ? `Updated email on ${count} member ${count === 1 ? 'record' : 'records'}`
          : 'No member records needed updating'
      );
    } catch (error) {
      this.analytics.logError(
        'Group Email Update Dialog',
        onlyOld ? 'update_old_email_only' : 'update_all',
        'Failed to update member emails',
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.#notify('Something went wrong - could not update member emails');
    } finally {
      this.loading.loadingOff();
      this.dialogRef.close();
    }
  }

  #notify(message: string): void {
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message },
    });
  }
}
