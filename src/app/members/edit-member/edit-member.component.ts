import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
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
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { Member } from '@models/member';
import { MemberService } from '@services/member.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { catchError, map, throwError } from 'rxjs';

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
    private analytics: AngularFireAnalytics,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.member = this.data.member;
    this.userId = this.data.userId;
    this.isGroupAdmin = this.data.isGroupAdmin;
    this.editMemberForm = this.fb.group({
      memberName: [this.member.displayName, Validators.required],
      email: [this.member.email, [Validators.required, Validators.email]],
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
      email: form.email,
      active: form.active,
      groupAdmin: form.groupAdmin,
    };
    this.memberService
      .updateMember(this.data.groupId, this.member.id, changes)
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
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'edit_member',
            message: err.message,
          });
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
          .deleteMemberFromGroup(this.data.groupId, this.member.id)
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
              this.analytics.logEvent('error', {
                component: this.constructor.name,
                action: 'remove_member',
                message: err.message,
              });
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
