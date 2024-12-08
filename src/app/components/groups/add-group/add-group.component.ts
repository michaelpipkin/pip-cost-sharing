import { Component, inject, Signal } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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

@Component({
    selector: 'app-add-group',
    templateUrl: './add-group.component.html',
    styleUrl: './add-group.component.scss',
    imports: [
        FormsModule,
        MatButtonModule,
        MatDialogModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSlideToggleModule,
    ]
})
export class AddGroupComponent {
  dialogRef = inject(MatDialogRef<AddGroupComponent>);
  fb = inject(FormBuilder);
  userService = inject(UserService);
  groupService = inject(GroupService);
  snackBar = inject(MatSnackBar);
  analytics = inject(Analytics);

  newGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    displayName: ['', Validators.required],
    autoAddMembers: [false],
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
      autoAddMembers: val.autoAddMembers,
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
        logEvent(this.analytics, 'error', {
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
}
