import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSelectChange } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabChangeEvent } from '@angular/material/tabs';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import firebase from 'firebase/compat/app';
import { Observable, tap } from 'rxjs';
import { AddGroupComponent } from '../add-group/add-group.component';
import { JoinGroupComponent } from '../join-group/join-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
})
export class GroupsComponent implements OnInit {
  currentUser: firebase.User;
  currentMember: Member;
  groups$: Observable<Group[]>;
  selectedGroupId: string;
  isGroupAdmin: boolean = false;
  expensesChanged: string = '';
  selectedTab: number;

  constructor(
    private groupService: GroupService,
    private memberService: MemberService,
    private dialog: MatDialog,
    private loading: LoadingService,
    private snackBar: MatSnackBar,
    userService: UserService
  ) {
    this.currentUser = userService.getCurrentUser();
  }

  ngOnInit(): void {
    this.refreshGroups();
  }

  refreshGroups(): void {
    this.loading.loadingOn();
    this.groups$ = this.groupService
      .getGroupsForUser(this.currentUser.uid)
      .pipe(tap(() => this.loading.loadingOff()));
  }

  addGroup(): void {
    const dialogRef = this.dialog.open(AddGroupComponent);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Group added!', 'OK');
        this.refreshGroups();
      }
    });
  }

  joinGroup(): void {
    const dialogRef = this.dialog.open(JoinGroupComponent);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Group joined!', 'OK');
        this.refreshGroups();
      }
    });
  }

  onSelectGroup(e: MatSelectChange): void {
    this.memberService
      .getMemberByUserId(e.value, this.currentUser.uid)
      .pipe(
        tap((member) => {
          this.currentMember = member;
          this.isGroupAdmin = member.groupAdmin;
        })
      )
      .subscribe();
  }

  copyGroupCode(): void {
    navigator.clipboard.writeText(this.selectedGroupId);
    this.snackBar.open('Group join code copied', 'OK', {
      duration: 2000,
    });
  }

  manageGroups(): void {
    const dialogConfig: MatDialogConfig = {
      data: this.currentUser,
    };
    const dialogRef = this.dialog.open(ManageGroupsComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open(`Group updated`, 'OK');
      }
    });
  }

  onSelectedTabChange(e: MatTabChangeEvent): void {
    this.selectedTab = e.index;
  }
}
