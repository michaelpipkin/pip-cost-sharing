import { Component, inject, Signal } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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
import { Member } from '@models/member';
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
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
})
export class EditMemberComponent {
  protected readonly dialogRef = inject(MatDialogRef<EditMemberComponent>);
  protected readonly fb = inject(FormBuilder);
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

  public member: Member = this.data.member;

  editMemberForm: FormGroup;

  currentMember: Signal<Member | null> = this.memberStore.currentMember;
  user: Signal<User | null> = this.userStore.user;

  groupAdminTooltip: string = '';

  constructor() {
    this.editMemberForm = this.fb.group({
      memberName: [this.member.displayName, Validators.required],
      email: [this.member.email, Validators.email],
      active: [this.member.active],
      groupAdmin: [
        {
          value: this.member.groupAdmin,
          disabled: this.member.userRef?.eq(this.user()!.ref!),
        },
      ],
    });
    if (this.member.userRef?.eq(this.user()!.ref!)) {
      this.groupAdminTooltip = 'You cannot remove yourself as a group admin';
    }
  }

  public get f() {
    return this.editMemberForm.controls;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const form = this.editMemberForm.getRawValue();
      const changes: Partial<Member> = {
        displayName: form.memberName,
        email: form.email,
        active: form.active,
        groupAdmin: form.groupAdmin,
      };
      await this.memberService.updateMemberWithUserMatching(
        this.member.ref!,
        changes,
        this.member.userRef,
        this.member.email
      );
      this.dialogRef.close({
        success: true,
        operation: 'saved',
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'EditMemberComponent',
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
          await this.memberService.removeMemberFromGroup(
            this.data.groupId,
            this.member.ref!
          );
          this.dialogRef.close({
            success: true,
            operation: 'removed',
          });
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'EditMemberComponent',
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
          await this.memberService.leaveGroup(
            this.data.groupId,
            this.member.ref!
          );
          this.groupStore.clearCurrentGroup();
          this.groupStore.removeGroup(this.data.groupId);
          this.userStore.updateUser({ defaultGroupRef: null });
          localStorage.removeItem('currentGroup');
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: {
              message: 'You have left the group successfully.',
            },
          });
          this.dialogRef.close();
          this.router.navigate(['/groups']);
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'EditMemberComponent',
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
