import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '@models/member';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import firebase from 'firebase/compat/app';
import { catchError, map, tap, throwError } from 'rxjs';

@Component({
  selector: 'app-join-group',
  templateUrl: './join-group.component.html',
  styleUrl: './join-group.component.scss',
})
export class JoinGroupComponent {
  joinGroupForm = this.fb.group({
    groupId: ['', Validators.required],
    displayName: ['', Validators.required],
  });
  currentUser: firebase.User;

  constructor(
    private dialogRef: MatDialogRef<JoinGroupComponent>,
    private fb: FormBuilder,
    private memberService: MemberService,
    private snackBar: MatSnackBar,
    userService: UserService
  ) {
    this.currentUser = userService.getCurrentUser();
  }

  public get f() {
    return this.joinGroupForm.controls;
  }

  onSubmit(): void {
    this.joinGroupForm.disable();
    const val = this.joinGroupForm.value;
    const newMember: Partial<Member> = {
      userId: this.currentUser.uid,
      displayName: val.displayName,
      email: this.currentUser.email,
      active: true,
      groupAdmin: false,
    };
    this.memberService
      .addMemberToGroup(val.groupId, newMember)
      .pipe(
        map((res) => {
          if (res.name === 'Error') {
            this.snackBar.open(res.message, 'Close', {
              verticalPosition: 'top',
            });
            this.joinGroupForm.enable();
          } else {
            this.dialogRef.close(true);
          }
        }),
        catchError((err: Error) => {
          this.snackBar.open(
            'Something went wrong - could not join group. Please check the group code.',
            'Close',
            {
              verticalPosition: 'top',
            }
          );
          this.joinGroupForm.enable();
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
