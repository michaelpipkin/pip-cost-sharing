import { Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { DemoService } from '@services/demo.service';
import { GroupService } from '@services/group.service';
import { LoadingService } from '@shared/loading/loading.service';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
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
  ],
})
export class AddGroupComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<AddGroupComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly demoService = inject(DemoService);
  protected readonly groupService = inject(GroupService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

  newGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    displayName: ['', Validators.required],
    autoAddMembers: [false],
  });
  user: Signal<User> = this.userStore.user;

  public get f() {
    return this.newGroupForm.controls;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const val = this.newGroupForm.value;
      const newGroup: Partial<Group> = {
        name: val.groupName,
        active: true,
        autoAddMembers: val.autoAddMembers,
      };
      const newMember: Partial<Member> = {
        userRef: this.user().ref,
        displayName: val.displayName,
        email: this.user().email,
        active: true,
        groupAdmin: true,
      };
      const groupRef = await this.groupService.addGroup(newGroup, newMember);
      this.dialogRef.close(groupRef);
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_group',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not add group.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
