import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectChange } from '@angular/material/select';
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
  columnsToDisplay: string[] = ['name', 'memberCount'];
  selectedGroupId: string;

  constructor(
    private groupService: GroupService,
    private router: Router,
    private dialog: MatDialog,
    private loading: LoadingService,
    userService: UserService
  ) {
    this.currentUser = userService.getCurrentUser();
  }

  ngOnInit(): void {
    this.loading.loadingOn();
    this.groups$ = this.groupService
      .getGroupsForUser(this.currentUser.uid)
      .pipe(tap(() => this.loading.loadingOff()));
  }

  addGroup(): void {
    this.dialog.open(AddGroupComponent);
  }

  joinGroup(): void {
    this.dialog.open(JoinGroupComponent);
  }

  onSelectGroup(e: MatSelectChange): void {}
}
