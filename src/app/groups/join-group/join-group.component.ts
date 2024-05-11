import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
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
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '@models/member';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import firebase from 'firebase/compat/app';
import { catchError, map, throwError } from 'rxjs';

@Component({
  selector: 'app-join-group',
  templateUrl: './join-group.component.html',
  styleUrl: './join-group.component.scss',
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
    private analytics: AngularFireAnalytics,
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
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'join_group',
            message: err.message,
          });
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
