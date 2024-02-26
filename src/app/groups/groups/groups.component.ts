import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSelectChange } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Group } from '@models/group';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import firebase from 'firebase/compat/app';
import { Observable, tap } from 'rxjs';
import { AddGroupComponent } from '../add-group/add-group.component';
import { JoinGroupComponent } from '../join-group/join-group.component';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
})
export class GroupsComponent implements OnInit {
  currentUser: firebase.User;
  groups$: Observable<Group[]>;
  selectedGroupId: string;
  dialogConfig: MatDialogConfig = {
    width: '520px',
  };

  constructor(
    private groupService: GroupService,
    private router: Router,
    private dialog: MatDialog,
    private loading: LoadingService,
    private snackbar: MatSnackBar,
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
    const dialogRef = this.dialog.open(AddGroupComponent, this.dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackbar.open('Group added!', 'OK');
        this.refreshGroups();
      }
    });
  }

  joinGroup(): void {
    const dialogRef = this.dialog.open(JoinGroupComponent, this.dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackbar.open('Group joined!', 'OK');
        this.refreshGroups();
      }
    });
  }

  onSelectGroup(e: MatSelectChange): void {}

  copyGroupCode(): void {
    navigator.clipboard.writeText(this.selectedGroupId);
    this.snackbar.open('Group join code copied', 'OK', {
      duration: 2000,
    });
  }
}
