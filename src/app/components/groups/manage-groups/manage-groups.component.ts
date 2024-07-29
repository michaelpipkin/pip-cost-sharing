import { Component, computed, inject, model, Signal } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';

@Component({
  selector: 'app-manage-groups',
  templateUrl: './manage-groups.component.html',
  styleUrl: './manage-groups.component.scss',
  standalone: true,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    ReactiveFormsModule,
    MatInput,
    MatError,
    MatSlideToggle,
    MatDialogActions,
  ],
})
export class ManageGroupsComponent {
  groupService = inject(GroupService);
  dialogRef = inject(MatDialogRef<ManageGroupsComponent>);
  fb = inject(FormBuilder);
  snackBar = inject(MatSnackBar);
  analytics = inject(Analytics);
  loading = inject(LoadingService);
  user: User = inject(MAT_DIALOG_DATA);

  userAdminGroups = computed<Group[]>(() => {
    const adminGroupsIds = this.groupService.adminGroupIds();
    return this.groupService
      .allUserGroups()
      .filter((g) => adminGroupsIds.includes(g.id));
  });

  editGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    active: [false],
  });

  selectedGroup = model<Group>(null);

  public get f() {
    return this.editGroupForm.controls;
  }

  onSelectGroup(): void {
    this.editGroupForm.patchValue({
      groupName: this.selectedGroup().name,
      active: this.selectedGroup().active,
    });
  }

  onSubmit(): void {
    this.editGroupForm.disable();
    const form = this.editGroupForm.value;
    const changes: Partial<Group> = {
      name: form.groupName,
      active: form.active,
    };
    this.loading.loadingOn();
    this.groupService
      .updateGroup(this.selectedGroup().id, changes)
      .then(() => {
        this.dialogRef.close({
          success: true,
          operation: 'saved',
        });
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'edit_group',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not edit group.',
          'Close'
        );
        this.editGroupForm.enable();
      })
      .finally(() => this.loading.loadingOff());
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
