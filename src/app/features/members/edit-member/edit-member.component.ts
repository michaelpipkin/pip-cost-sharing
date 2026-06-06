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
  email,
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
import { EditMemberForm, Member } from '@models/member';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { MemberService } from '@services/member.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-edit-member',
  templateUrl: './edit-member.component.html',
  styleUrl: './edit-member.component.scss',
  imports: [
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
  protected readonly memberService = inject(MemberService);
  protected readonly router = inject(Router);
  protected readonly demoService = inject(DemoService);
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

  protected readonly activeTooltip: string =
    this.activeMemberCount === 1 && this.member.active
      ? 'There must be at least one active member in the group'
      : '';
  protected readonly groupAdminTooltip: string = this.member.userRef?.eq(
    this.userStore.user()!.ref!
  )
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
    email(p.email, { message: '*Not a valid email address' });
    disabled(p.active, {
      when: () =>
        this.activeMemberCount === 1 && !!this.editMemberModel().active,
    });
    disabled(p.groupAdmin, {
      when: () => !!this.member.userRef?.eq(this.userStore.user()!.ref!),
    });
  });

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
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const val = this.editMemberForm().value();
      const changes: Partial<Member> = {
        displayName: val.memberName,
        email: val.email,
        active: val.active,
        groupAdmin: val.groupAdmin,
      };
      const memberRef = this.member.ref!;
      await this.memberService.updateMemberWithUserMatching(
        memberRef,
        changes,
        this.member.userRef,
        this.member.email
      );
      this.dialogRef.close({ success: true, operation: 'saved' });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Edit Member Component',
          'edit_member',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not edit member' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
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
          await this.memberService.leaveGroup(this.data.groupId, memberRef);
          this.groupStore.clearCurrentGroup();
          this.groupStore.removeGroup(this.data.groupId);
          this.userStore.updateUser({ defaultGroupRef: null });
          localStorage.removeItem('currentGroup');
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
