import { Component, inject, model, OnInit, Signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { GroupService } from '@services/group.service';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { getAnalytics, logEvent } from 'firebase/analytics';

@Component({
  selector: 'app-manage-groups',
  templateUrl: './manage-groups.component.html',
  styleUrl: './manage-groups.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
})
export class ManageGroupsComponent implements OnInit {
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly dialogRef = inject(MatDialogRef<ManageGroupsComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly loading = inject(LoadingService);
  protected readonly data = inject(MAT_DIALOG_DATA);

  selectedGroup = model<Group>(this.data.group as Group);

  userAdminGroups: Signal<Group[]> = this.groupStore.userAdminGroups;

  editGroupForm = this.fb.group({
    groupId: [''],
    groupName: ['', Validators.required],
    active: [false],
    autoAddMembers: [false],
  });

  ngOnInit(): void {
    const group = this.selectedGroup();
    this.editGroupForm.patchValue({
      groupId: group.id,
      groupName: group.name,
      active: group.active ?? false,
      autoAddMembers: group.autoAddMembers ?? false,
    });
  }

  public get f() {
    return this.editGroupForm.controls;
  }

  onSelectGroup(): void {
    const group = this.userAdminGroups().find(
      (g) => g.id === this.f.groupId.value
    );
    this.selectedGroup.set(group);
    this.editGroupForm.patchValue({
      groupName: this.selectedGroup().name,
      active: this.selectedGroup().active ?? false,
      autoAddMembers: this.selectedGroup().autoAddMembers ?? false,
    });
    this.editGroupForm.markAsPristine();
    this.editGroupForm.markAsUntouched();
  }

  onSubmit(): void {
    this.editGroupForm.disable();
    const form = this.editGroupForm.value;
    const changes: Partial<Group> = {
      name: form.groupName,
      active: form.active,
      autoAddMembers: form.autoAddMembers,
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
}
