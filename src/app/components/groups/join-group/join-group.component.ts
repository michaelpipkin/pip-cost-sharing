import { Component, inject, Signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '@models/member';
import { User } from '@models/user';
import { MemberService } from '@services/member.service';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';

@Component({
  selector: 'app-join-group',
  templateUrl: './join-group.component.html',
  styleUrl: './join-group.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
})
export class JoinGroupComponent {
  protected readonly dialogRef = inject(MatDialogRef<JoinGroupComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly memberService = inject(MemberService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

  joinGroupForm = this.fb.group({
    groupId: ['', Validators.required],
    displayName: ['', Validators.required],
  });

  user: Signal<User> = this.userStore.user;

  public get f() {
    return this.joinGroupForm.controls;
  }

  onSubmit(): void {
    this.joinGroupForm.disable();
    const val = this.joinGroupForm.value;
    const newMember: Partial<Member> = {
      userRef: this.user().ref,
      displayName: val.displayName,
      email: this.user().email,
      active: true,
      groupAdmin: false,
    };
    this.memberService
      .addMemberToGroup(val.groupId, newMember)
      .then((res) => {
        if (!!res && res.name === 'Error') {
          this.snackBar.open(res.message, 'Close', {
            verticalPosition: 'top',
          });
          this.joinGroupForm.enable();
        } else {
          this.dialogRef.close(true);
        }
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
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
      });
  }
}
