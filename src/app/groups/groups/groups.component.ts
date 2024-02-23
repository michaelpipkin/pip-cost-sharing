import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Group } from '@models/group';
import { GroupsService } from '@services/groups.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
})
export class GroupsComponent implements OnInit {
  groups$: Observable<Group[]>;
  columnsToDisplay: string[] = ['name', 'memberCount'];

  constructor(
    private groupsService: GroupsService,
    private user: UserService,
    private router: Router,
    private dialog: MatDialog,
    private loading: LoadingService
  ) {}

  ngOnInit(): void {}
}
