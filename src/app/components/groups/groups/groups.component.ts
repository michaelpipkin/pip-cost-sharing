import { Component, effect, inject, Signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Group } from '@models/group';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { DocumentReference } from 'firebase/firestore';
import { AddGroupComponent } from '../add-group/add-group.component';
import { JoinGroupComponent } from '../join-group/join-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatTooltipModule,
    MatIconModule,
    MatButtonModule,
    DocRefCompareDirective,
  ],
})
export class GroupsComponent {
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly loadingService = inject(LoadingService);
  protected readonly memberStore = inject(MemberStore);
  protected readonly dialog = inject(MatDialog);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly fb = inject(FormBuilder);
  protected readonly analytics = inject(getAnalytics);

  #user: Signal<User> = this.userStore.user;
  #currentGroup: Signal<Group> = this.groupStore.currentGroup;
  allUserGroups: Signal<Group[]> = this.groupStore.allUserGroups;
  activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;

  groupForm = this.fb.group({
    selectedGroupRef: [this.groupStore.currentGroup()?.ref ?? null],
  });

  constructor() {
    effect(() => {
      if (!this.groupStore.loaded()) {
        this.loadingService.loadingOn();
      } else {
        this.loadingService.loadingOff();
      }
    });
  }

  get selectedGroupRef() {
    return this.groupForm.get('selectedGroupRef').value;
  }

  addGroup(): void {
    const dialogRef = this.dialog.open(AddGroupComponent);
    dialogRef
      .afterClosed()
      .subscribe(async (groupRef: DocumentReference<Group>) => {
        if (groupRef) {
          this.snackBar.open('Group added!', 'OK');
          if (this.activeUserGroups().length === 1) {
            try {
              this.loadingService.loadingOn();
              await this.groupService.getGroup(groupRef, this.#user().ref);
              this.groupForm.patchValue({ selectedGroupRef: groupRef });
            } catch (error) {
              this.snackBar.open('Error selecting new group', 'OK');
              logEvent(this.analytics, 'select_group_error', {
                error: error.message,
              });
            } finally {
              this.loadingService.loadingOff();
            }
          }
        }
      });
  }

  joinGroup(): void {
    const dialogRef = this.dialog.open(JoinGroupComponent);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Group joined!', 'OK');
      }
    });
  }

  async onSelectGroup(e: MatSelectChange): Promise<void> {
    await this.groupService.getGroup(e.value, this.#user().ref);
  }

  copyGroupCode(): void {
    navigator.clipboard.writeText(this.selectedGroupRef.id);
    this.snackBar.open('Group join code copied', 'OK', {
      duration: 2000,
    });
  }

  manageGroups(): void {
    const dialogConfig: MatDialogConfig = {
      data: { user: this.#user(), group: this.#currentGroup() },
    };
    const dialogRef = this.dialog.open(ManageGroupsComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open(`Group updated`, 'OK');
        if (this.groupStore.currentGroup() === null) {
          this.groupForm.patchValue({ selectedGroupRef: null });
        }
      }
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'groups' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
