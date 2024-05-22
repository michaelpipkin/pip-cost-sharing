import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, effect, inject, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatOption } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { AddGroupComponent } from '../add-group/add-group.component';
import { JoinGroupComponent } from '../join-group/join-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
  standalone: true,
  imports: [
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    CommonModule,
    MatTooltip,
    AsyncPipe,
  ],
})
export class GroupsComponent {
  userService = inject(UserService);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);

  user: Signal<User> = this.userService.user;
  currentMember: Signal<Member> = this.memberService.currentGroupMember;
  userGroups: Signal<Group[]> = this.groupService.activeUserGroups;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  isGroupAdmin: boolean = false;
  selectedGroupId: string;

  constructor() {
    effect(() => {
      if (!!this.currentGroup()) {
        this.selectedGroupId = this.currentGroup().id;
      } else {
        this.selectedGroupId = '';
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
    this.memberService.getMemberByUserId(e.value, this.user().id);
    this.groupService.getGroupById(e.value);
  }

  copyGroupCode(): void {
    navigator.clipboard.writeText(this.selectedGroupId);
    this.snackBar.open('Group join code copied', 'OK', {
      duration: 2000,
    });
  }

  manageGroups(): void {
    const dialogConfig: MatDialogConfig = {
      data: this.user(),
    };
    const dialogRef = this.dialog.open(ManageGroupsComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open(`Group updated`, 'OK');
      }
    });
  }
}
