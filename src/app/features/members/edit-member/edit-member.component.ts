import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Signal,
  signal,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  required,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { DefaultButtonDirective } from '@directives/default-button.directive';
import { EditMemberForm, Member } from '@models/member';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  AUTH_LOOKUP_UNAVAILABLE,
  callableError,
  CONFIRMATION_RECENTLY_SENT,
  isAuthLookupUnavailable,
  isConfirmationCooldownRefusal,
  isUnverifiedLoginRefusal,
  VERIFY_LOGIN_EMAIL,
} from '@utils/callable-error.util';
import { singleEmail } from '@utils/email-validation';
import { DocumentReference } from 'firebase/firestore';

/**
 * requestMemberEmailChange refusals that are outcomes for the user, shown
 * with the server's message and not logged as errors.
 */
const EXPECTED_CALLABLE_CODES = new Set([
  'functions/already-exists',
  'functions/invalid-argument',
  'functions/permission-denied',
  'functions/resource-exhausted',
]);

@Component({
  selector: 'app-edit-member',
  templateUrl: './edit-member.component.html',
  styleUrl: './edit-member.component.scss',
  imports: [
    DefaultButtonDirective,
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditMemberComponent {
  protected readonly dialogRef = inject(MatDialogRef<EditMemberComponent>);
  protected readonly dialog = inject(MatDialog);
  protected readonly userStore = inject(UserStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly memberService = inject(MemberService);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly data: any = inject(MAT_DIALOG_DATA);

  readonly member: Member = this.data.member;
  protected readonly currentMember: Signal<Member | null> =
    this.memberStore.currentMember;
  protected readonly user: Signal<User | null> = this.userStore.user;

  private readonly activeMemberCount =
    this.memberStore.activeGroupMembers().length;

  /** This row is the signed-in user's own member record. */
  protected readonly isOwnRow: boolean = !!this.member.userRef?.eq(
    this.userStore.user()!.ref!
  );
  /**
   * A linked member's email may hold only an address its user has proven
   * they own (firestore.rules, Plan 4 B19), so once a member is linked to
   * someone else's profile, only that member can change it.
   */
  protected readonly emailLocked: boolean =
    !!this.member.userRef && !this.isOwnRow;
  protected readonly lockedEmailHint =
    'Only the member can change their email address once it is linked to their profile.';

  protected readonly activeTooltip: string = this.#computeActiveTooltip();
  protected readonly groupAdminTooltip: string = this.isOwnRow
    ? 'You cannot remove yourself as a group admin'
    : '';

  protected readonly editMemberModel = signal<EditMemberForm>({
    memberName: this.member.displayName,
    email: this.member.email ?? '',
    active: this.member.active,
    groupAdmin: this.member.groupAdmin,
  });

  protected readonly editMemberForm = form(this.editMemberModel, (p) => {
    required(p.memberName, { message: '*Required' });
    // Group mail goes to your own group email, so it can't be cleared (the
    // server refuses '' too). A row that is already blank stays savable.
    required(p.email, {
      message: "*Your group email can't be blank",
      when: () => this.isOwnRow && !!this.member.email,
    });
    singleEmail(p.email, { message: '*Not a valid email address' });
    disabled(p.email, { when: () => this.emailLocked });
    disabled(p.active, {
      when: () =>
        !!this.member.leftGroup ||
        (this.activeMemberCount === 1 && !!this.editMemberModel().active),
    });
    disabled(p.groupAdmin, { when: () => this.isOwnRow });
  });

  #computeActiveTooltip(): string {
    if (this.member.leftGroup) {
      return 'This member left the group voluntarily. They can rejoin from their own account settings.';
    }
    if (this.activeMemberCount === 1 && this.member.active) {
      return 'There must be at least one active member in the group';
    }
    return '';
  }

  protected readonly hasChanges = computed(() => {
    const current = this.editMemberForm().value();
    return (
      current.memberName !== this.member.displayName ||
      current.email !== (this.member.email ?? '') ||
      current.active !== this.member.active ||
      current.groupAdmin !== this.member.groupAdmin
    );
  });

  async onSubmit(): Promise<void> {
    try {
      this.loading.loadingOn();
      const val = this.editMemberForm().value();
      const memberRef = this.member.ref!;
      if (this.isOwnRow) {
        await this.#saveOwnRow(memberRef, val);
        return;
      }
      // Someone else's row, or an unlinked one. An unlinked member's email
      // is written directly (and may link it). A linked member's is locked
      // and left out: the rules refuse any change to it, and a legacy doc
      // with no (or a null) email would otherwise gain ''.
      const changes: Partial<Member> = {
        displayName: val.memberName,
        active: val.active,
        groupAdmin: val.groupAdmin,
      };
      if (!this.emailLocked) changes.email = val.email;
      await this.memberService.updateMemberWithUserMatching(
        memberRef,
        changes,
        this.member.userRef,
        this.member.email
      );
      this.dialogRef.close({ success: true, operation: 'saved' });
    } catch (error) {
      this.#reportSaveError(error);
    } finally {
      this.loading.loadingOff();
    }
  }

  #reportSaveError(error: unknown): void {
    // The server's message, without the HTTP status the SDK appends.
    const { code, message: serverMessage } = callableError(error);
    let message: string;
    if (isConfirmationCooldownRefusal(error)) {
      // The address got a confirmation mail within the hour (from anyone).
      message = CONFIRMATION_RECENTLY_SENT;
    } else if (code === 'functions/resource-exhausted') {
      message = 'Too many email change requests. Please try again tomorrow.';
    } else if (isUnverifiedLoginRefusal(error)) {
      message = VERIFY_LOGIN_EMAIL;
    } else if (isAuthLookupUnavailable(error)) {
      // An Auth outage on the server (which logs it); saving again can work.
      message = AUTH_LOOKUP_UNAVAILABLE;
    } else if (error instanceof Error) {
      message = serverMessage;
      if (!code || !EXPECTED_CALLABLE_CODES.has(code)) {
        this.analytics.logError(
          'Edit Member Component',
          'edit_member',
          error.message
        );
      }
    } else {
      message = 'Something went wrong - could not edit member';
    }
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message },
    });
  }

  /**
   * One's own linked row. The other fields are written first, as usual;
   * then a changed email goes through the server (requestMemberEmailChange),
   * which applies the verified sign-in address at once and otherwise mails a
   * confirmation link to the new address. If that request is refused (the
   * daily limit, the address's hourly cooldown, a duplicate address), only
   * the refusal is reported and the dialog stays open; the other fields are
   * already saved.
   */
  async #saveOwnRow(
    memberRef: DocumentReference<Member>,
    val: EditMemberForm
  ): Promise<void> {
    const emailChanged =
      val.email.trim().toLowerCase() !==
      (this.member.email ?? '').trim().toLowerCase();
    await this.memberService.updateMember(memberRef, {
      displayName: val.memberName,
      active: val.active,
      groupAdmin: val.groupAdmin,
    });
    const status = emailChanged
      ? await this.memberService.requestMemberEmailChange(
          this.data.groupId,
          this.member.id,
          val.email
        )
      : 'unchanged';
    this.dialogRef.close(
      status === 'pending'
        ? {
            success: true,
            operation: 'saved',
            message: `We sent a confirmation link to ${val.email}. Your group email will change once you confirm it.`,
          }
        : { success: true, operation: 'saved' }
    );
  }

  removeMember(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Remove',
        target: `member: ${this.member.displayName}`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          const memberRef = this.member.ref!;
          await this.memberService.removeMemberFromGroup(
            this.data.groupId,
            memberRef
          );
          this.dialogRef.close({ success: true, operation: 'removed' });
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Edit Member Component',
              'remove_member',
              error.message
            );
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: {
                message: 'Something went wrong - could not remove member',
              },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  leaveGroup(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        dialogTitle: 'Confirm Leaving Group',
        confirmationText:
          'Are you sure you want to leave the group? You will no longer have access to group expenses.',
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Leave',
      },
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          const memberRef = this.member.ref!;
          const { deleted } = await this.memberService.leaveGroup(
            this.data.groupId,
            memberRef
          );
          // Also stops the left group's data listeners, not just unselects it
          this.groupService.clearCurrentGroup();
          if (deleted) {
            // No historical splits - the member doc is gone entirely, so
            // there's nothing left to rejoin; drop the group from the list.
            this.groupStore.removeGroup(this.data.groupId);
          } else {
            // Member doc kept (has history) - re-tag it as left rather than
            // removing it, so it correctly appears as a rejoin candidate
            // immediately instead of only after the next full reload.
            this.groupStore.patchGroupMembership(this.data.groupId, {
              userActiveInGroup: false,
              userLeftGroup: true,
              userIsAdmin: false,
            });
          }
          this.userStore.updateUser({ defaultGroupRef: null });
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'You have left the group successfully.' },
          });
          this.dialogRef.close();
          this.router.navigate(['/groups']);
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Edit Member Component',
              'leave_group',
              error.message
            );
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: {
                message: 'Something went wrong - could not leave group',
              },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }
}
