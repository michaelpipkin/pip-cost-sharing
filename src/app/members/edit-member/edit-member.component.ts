import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '@models/member';
import { MemberService } from '@services/member.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { catchError, map, throwError } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
} from '@angular/material/dialog';

@Component({
  selector: 'app-edit-member',
  templateUrl: './edit-member.component.html',
  styleUrl: './edit-member.component.scss',
})
export class EditMemberComponent {
  member: Member;
  userId: string;
  isGroupAdmin: boolean = false;
  groupAdminTooltip: string = '';
  editMemberForm: FormGroup;

  constructor(
    private dialogRef: MatDialogRef<EditMemberComponent>,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private memberService: MemberService,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.member = this.data.member;
    this.userId = this.data.userId;
    this.isGroupAdmin = this.data.isGroupAdmin;
    this.editMemberForm = this.fb.group({
      memberName: [this.member.displayName, Validators.required],
      active: [this.member.active],
      groupAdmin: [
        {
          value: this.member.groupAdmin,
          disabled: this.member.userId === this.userId,
        },
      ],
    });
    if (this.member.userId == this.userId) {
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
      active: form.active,
      groupAdmin: form.groupAdmin,
    };
    this.memberService
      .updateMember(this.member.groupId, this.member.id, changes)
      .pipe(
        map((res) => {
          if (res.name === 'Error') {
            this.snackBar.open(res.message, 'Close');
            this.editMemberForm.enable();
          } else {
            this.dialogRef.close({
              success: true,
              operation: 'saved',
            });
          }
        }),
        catchError((err: Error) => {
          this.snackBar.open(
            'Something went wrong - could not edit member.',
            'Close'
          );
          this.editMemberForm.enable();
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
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
        this.memberService
          .deleteMemberFromGroup(this.member.groupId, this.member.id)
          .pipe(
            map((res) => {
              if (res.name === 'Error') {
                this.snackBar.open(res.message, 'Close');
              } else {
                this.dialogRef.close({
                  success: true,
                  operation: 'removed',
                });
              }
            }),
            catchError((err: Error) => {
              this.snackBar.open(
                'Something went wrong - could not remove member.',
                'Close'
              );
              return throwError(() => new Error(err.message));
            })
          )
          .subscribe();
      }
    });
  }

  close(): void {
    this.dialogRef.close({
      success: false,
    });
  }
}
