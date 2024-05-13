import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import firebase from 'firebase/compat/app';
import { catchError, tap, throwError } from 'rxjs';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';

@Component({
  selector: 'app-add-group',
  templateUrl: './add-group.component.html',
  styleUrl: './add-group.component.scss',
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
    MatDialogActions,
  ],
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
    private analytics: AngularFireAnalytics,
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
      active: true,
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
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'add_group',
            message: err.message,
          });
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
