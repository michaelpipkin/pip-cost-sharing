import { CommonModule } from '@angular/common';
import { Component, inject, model, Signal } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { Member } from '@models/member';
import { User } from '@models/user';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogConfig,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';

@Component({
  selector: 'app-edit-member',
  templateUrl: './edit-member.component.html',
  styleUrl: './edit-member.component.scss',
  standalone: true,
  imports: [
    MatDialogTitle,
    FormsModule,
    ReactiveFormsModule,
    MatDialogContent,
    MatFormField,
    MatLabel,
    MatInput,
    CommonModule,
    MatError,
    MatSlideToggle,
    MatTooltip,
    MatDialogActions,
  ],
})
export class EditMemberComponent {
  dialogRef = inject(MatDialogRef<EditMemberComponent>);
  fb = inject(FormBuilder);
  dialog = inject(MatDialog);
  userService = inject(UserService);
  memberService = inject(MemberService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  analytics = inject(Analytics);
  data: any = inject(MAT_DIALOG_DATA);

  private member: Member = this.data.member;

  editMemberForm: FormGroup;

  currentMember: Signal<Member> = this.memberService.currentGroupMember;
  user: Signal<User> = this.userService.user;

  groupAdminTooltip: string = '';

  constructor() {
    this.editMemberForm = this.fb.group({
      memberName: [this.member.displayName, Validators.required],
      email: [this.member.email, [Validators.required, Validators.email]],
      active: [this.member.active],
      groupAdmin: [
        {
          value: this.member.groupAdmin,
          disabled: this.member.userId === this.user().id,
        },
      ],
    });
    if (this.member.userId == this.user().id) {
      this.groupAdminTooltip = 'You cannot remove yourself as a group admin';
    }
  }

  public get f() {
    return this.editMemberForm.controls;
  }

  onSubmit(): void {
    this.editMemberForm.disable();
    const form = this.editMemberForm.value;
    const changes: Partial<Member> = {
      displayName: form.memberName,
      email: form.email,
      active: form.active,
      groupAdmin: form.groupAdmin,
    };
    this.loading.loadingOn();
    this.memberService
      .updateMember(this.data.groupId, this.member.id, changes)
      .then((res) => {
        if (res?.name === 'Error') {
          this.snackBar.open(res.message, 'Close');
          this.editMemberForm.enable();
        } else {
          this.dialogRef.close({
            success: true,
            operation: 'saved',
          });
        }
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'edit_member',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not edit member.',
          'Close'
        );
        this.editMemberForm.enable();
      })
      .finally(() => this.loading.loadingOff());
  }

  removeMember(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Remove',
        target: `member: ${this.member.displayName}`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        this.memberService
          .removeMemberFromGroup(this.data.groupId, this.member.id)
          .then((res) => {
            if (res?.name === 'Error') {
              this.snackBar.open(res.message, 'Close');
            } else {
              this.dialogRef.close({
                success: true,
                operation: 'removed',
              });
            }
          })
          .catch((err: Error) => {
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'remove_member',
              message: err.message,
            });
            this.snackBar.open(
              'Something went wrong - could not remove member.',
              'Close'
            );
          })
          .finally(() => this.loading.loadingOff());
      }
    });
  }

  close(): void {
    this.dialogRef.close({
      success: false,
    });
  }
}
