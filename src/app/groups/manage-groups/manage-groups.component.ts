import { AsyncPipe, CommonModule } from '@angular/common';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
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
import firebase from 'firebase/compat/app';
import { catchError, Observable, tap, throwError } from 'rxjs';
import {
  Component,
  inject,
  Inject,
  OnInit,
  WritableSignal,
} from '@angular/core';
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
    CommonModule,
    MatError,
    MatSlideToggle,
    MatDialogActions,
    AsyncPipe,
  ],
})
export class ManageGroupsComponent {
  groupService = inject(GroupService);
  dialogRef = inject(MatDialogRef<ManageGroupsComponent>);
  fb = inject(FormBuilder);
  snackBar = inject(MatSnackBar);
  analytics = inject(AngularFireAnalytics);
  loading = inject(LoadingService);
  user: User = inject(MAT_DIALOG_DATA);

  userAdminGroups: WritableSignal<Group[]> = this.groupService.adminUserGroups;

  editGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    active: [false],
  });
  selectedGroupId: string;
  selectedGroup: Group;

  public get f() {
    return this.editGroupForm.controls;
  }

  onSelectGroup(e): void {
    const group = this.userAdminGroups().find(
      (g) => g.id == this.selectedGroupId
    );
    this.selectedGroup = group;
    this.editGroupForm.patchValue({
      groupName: group.name,
      active: group.active,
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
      .updateGroup(this.selectedGroupId, changes)
      .then(() => {
        this.dialogRef.close({
          success: true,
          operation: 'saved',
        });
      })
      .catch((err: Error) => {
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'edit_group',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not edit group.',
          'Close'
        );
        this.editGroupForm.enable();
        return throwError(() => new Error(err.message));
      })
      .finally(() => this.loading.loadingOff());
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
