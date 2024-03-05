import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import firebase from 'firebase/compat/app';
import { catchError, tap, throwError } from 'rxjs';

@Component({
  selector: 'app-add-group',
  templateUrl: './add-group.component.html',
  styleUrl: './add-group.component.scss',
})
export class AddGroupComponent {
  newGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    displayName: ['', Validators.required],
  });
  currentUser: firebase.User;

  constructor(
    private dialogRef: MatDialogRef<AddGroupComponent>,
    private fb: FormBuilder,
    private groupService: GroupService,
    private snackBar: MatSnackBar,
    userService: UserService
  ) {
    this.currentUser = userService.getCurrentUser();
  }

  public get f() {
    return this.newGroupForm.controls;
  }

  onSubmit(): void {
    this.newGroupForm.disable();
    const val = this.newGroupForm.value;
    const newGroup: Partial<Group> = {
      name: val.groupName,
    };
    const newMember: Partial<Member> = {
      userId: this.currentUser.uid,
      displayName: val.displayName,
      email: this.currentUser.email,
      active: true,
      groupAdmin: true,
    };
    this.groupService
      .addGroup(newGroup, newMember)
      .pipe(
        tap(() => {
          this.dialogRef.close(true);
        }),
        catchError((err: Error) => {
          console.log(err.message);
          this.snackBar.open(
            'Something went wrong - could not add group.',
            'Close',
            {
              verticalPosition: 'top',
            }
          );
          this.newGroupForm.enable();
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
