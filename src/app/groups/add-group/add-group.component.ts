import { CommonModule } from '@angular/common';
import { Component, inject, Signal } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
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
  dialogRef = inject(MatDialogRef<AddGroupComponent>);
  fb = inject(FormBuilder);
  userService = inject(UserService);
  groupService = inject(GroupService);
  snackBar = inject(MatSnackBar);
  analytics = inject(AngularFireAnalytics);

  newGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    displayName: ['', Validators.required],
  });
  user: Signal<User> = this.userService.user;

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
      userId: this.user().id,
      displayName: val.displayName,
      email: this.user().email,
      active: true,
      groupAdmin: true,
    };
    this.groupService
      .addGroup(newGroup, newMember)
      .then(() => {
        this.dialogRef.close(true);
      })
      .catch((err: Error) => {
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
      });
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
