import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '@models/member';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';

@Component({
  selector: 'app-add-member',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './add-member.component.html',
  styleUrl: './add-member.component.scss',
})
export class AddMemberComponent {
  dialogRef = inject(MatDialogRef<AddMemberComponent>);
  fb = inject(FormBuilder);
  userService = inject(UserService);
  memberService = inject(MemberService);
  groupService = inject(GroupService);
  snackBar = inject(MatSnackBar);
  analytics = inject(getAnalytics);
  data: any = inject(MAT_DIALOG_DATA);

  addMemberForm = this.fb.group({
    displayName: ['', Validators.required],
    email: ['', Validators.email],
  });

  public get f() {
    return this.addMemberForm.controls;
  }

  onSubmit(): void {
    this.addMemberForm.disable();
    const val = this.addMemberForm.value;
    const newMember: Partial<Member> = {
      userId: '',
      displayName: val.displayName,
      email: val.email,
      active: true,
      groupAdmin: false,
    };
    this.memberService
      .addManualMemberToGroup(this.data.groupId, newMember)
      .then((res) => {
        if (res.name === 'Error') {
          this.snackBar.open(res.message, 'Close', {
            verticalPosition: 'top',
          });
          this.addMemberForm.enable();
        } else {
          this.dialogRef.close(true);
        }
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_member',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not add member.',
          'Close',
          {
            verticalPosition: 'top',
          }
        );
        this.addMemberForm.enable();
      });
  }
}
