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
import { Member } from '@models/member';
import { User } from '@models/user';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';

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
  dialogRef = inject(MatDialogRef<EditMemberComponent>);
  fb = inject(FormBuilder);
  dialog = inject(MatDialog);
  userService = inject(UserService);
  memberService = inject(MemberService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  analytics = inject(getAnalytics);
  data: any = inject(MAT_DIALOG_DATA);

  private member: Member = this.data.member;

  editMemberForm: FormGroup;

  currentMember: Signal<Member> = this.memberService.currentMember;
  user: Signal<User> = this.userService.user;

  groupAdminTooltip: string = '';

  constructor() {
    this.editMemberForm = this.fb.group({
      memberName: [this.member.displayName, Validators.required],
      email: [this.member.email, Validators.email],
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
}
