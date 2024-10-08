import { Component, inject, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HelpComponent } from '@components/help/help.component';
import { Group } from '@models/group';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { AddGroupComponent } from '../add-group/add-group.component';
import { JoinGroupComponent } from '../join-group/join-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
  standalone: true,
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
  userService = inject(UserService);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  dialog = inject(MatDialog);
  snackBar = inject(MatSnackBar);

  #user: Signal<User> = this.userService.user;
  #currentGroup: Signal<Group> = this.groupService.currentGroup;
  activeUserGroups: Signal<Group[]> = this.groupService.activeUserGroups;

  selectedGroupId = model<string>(this.#currentGroup()?.id ?? '');

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

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'groups',
        title: 'Groups Help',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }

  onSelectGroup(e: MatSelectChange): void {
    this.groupService.getGroup(e.value, this.#user().id);
  }

  copyGroupCode(): void {
    navigator.clipboard.writeText(this.selectedGroupId());
    this.snackBar.open('Group join code copied', 'OK', {
      duration: 2000,
    });
  }

  manageGroups(): void {
    const dialogConfig: MatDialogConfig = {
      data: this.#user(),
    };
    const dialogRef = this.dialog.open(ManageGroupsComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open(`Group updated`, 'OK');
      }
    });
  }
}
