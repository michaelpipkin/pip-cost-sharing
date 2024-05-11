import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatOption } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { GroupService } from '@services/group.service';
import firebase from 'firebase/compat/app';
import { catchError, map, Observable, tap, throwError } from 'rxjs';

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
export class ManageGroupsComponent implements OnInit {
  editGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    active: [false],
  });
  selectedGroupId: string;
  selectedGroup: Group;
  groups$: Observable<Group[]>;

  constructor(
    private dialogRef: MatDialogRef<ManageGroupsComponent>,
    private groupService: GroupService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private analytics: AngularFireAnalytics,
    @Inject(MAT_DIALOG_DATA) public currentUser: firebase.User
  ) {}

  ngOnInit(): void {
    this.groups$ = this.groupService.getAdminGroupsForUser(
      this.currentUser.uid
    );
  }

  public get f() {
    return this.editGroupForm.controls;
  }

  onSelectGroup(e): void {
    this.groups$
      .pipe(
        map((groups) => {
          const group = groups.find((g) => g.id == this.selectedGroupId);
          this.selectedGroup = group;
          this.editGroupForm.patchValue({
            groupName: group.name,
            active: group.active,
          });
        })
      )
      .subscribe();
  }

  onSubmit(): void {
    this.editGroupForm.disable();
    const form = this.editGroupForm.value;
    const changes: Partial<Group> = {
      name: form.groupName,
      active: form.active,
    };
    this.groupService
      .updateGroup(this.selectedGroupId, changes)
      .pipe(
        tap(() => {
          this.dialogRef.close({
            success: true,
            operation: 'saved',
          });
        }),
        catchError((err: Error) => {
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
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
