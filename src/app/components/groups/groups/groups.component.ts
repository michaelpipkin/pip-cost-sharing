import { Component, effect, inject, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Group } from '@models/group';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { AddGroupComponent } from '../add-group/add-group.component';
import { GroupsHelpComponent } from '../groups-help/groups-help.component';
import { JoinGroupComponent } from '../join-group/join-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatTooltipModule,
    MatIconModule,
    MatButtonModule,
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

  #user: Signal<User> = this.userStore.user;
  #currentGroup: Signal<Group> = this.groupStore.currentGroup;
  activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;

  selectedGroupId = model<string>(this.#currentGroup()?.id ?? '');

  constructor() {
    effect(() => {
      if (!this.groupStore.loaded()) {
        this.loadingService.loadingOn();
      } else {
        this.loadingService.loadingOff();
      }
    });
  }

  addGroup(): void {
    const dialogRef = this.dialog.open(AddGroupComponent);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Group added!', 'OK');
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

  onSelectGroup(e: MatSelectChange): void {
    this.groupService.getGroup(e.value, this.#user().ref);
  }

  copyGroupCode(): void {
    navigator.clipboard.writeText(this.selectedGroupId());
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
      }
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(GroupsHelpComponent, dialogConfig);
  }
}
