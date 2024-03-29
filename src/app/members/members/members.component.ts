import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import firebase from 'firebase/compat/app';
import { map, Observable, tap } from 'rxjs';
import { EditMemberComponent } from '../edit-member/edit-member.component';

@Component({
  selector: 'app-members',
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
})
export class MembersComponent implements OnInit {
  currentUser: firebase.User;
  currentGroup: Group;
  currentMember: Member;
  members$: Observable<Member[]>;
  filteredMembers$: Observable<Member[]>;
  activeOnly: boolean = false;
  nameFilter: string = '';
  sortField: string = 'displayName';
  sortAsc: boolean = true;
  columnsToDisplay: string[] = [
    'displayName',
    'email',
    'send',
    'active',
    'groupAdmin',
  ];

  constructor(
    private router: Router,
    private userService: UserService,
    private groupService: GroupService,
    private memberService: MemberService,
    private sorter: SortingService,
    private dialog: MatDialog,
    private loading: LoadingService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    if (this.groupService.getCurrentGroup() == null) {
      this.router.navigateByUrl('/groups');
    } else {
      this.currentUser = this.userService.getCurrentUser();
      this.currentGroup = this.groupService.getCurrentGroup();
      this.currentMember = this.memberService.getCurrentGroupMember();
      this.activeOnly = false;
      this.nameFilter = '';
      this.loadMembers();
      this.filterMembers();
    }
  }

  loadMembers(): void {
    this.loading.loadingOn();
    this.members$ = this.memberService
      .getAllGroupMembers(this.currentGroup.id)
      .pipe(tap(() => this.loading.loadingOff()));
  }

  filterMembers(): void {
    this.filteredMembers$ = this.members$.pipe(
      map((members: Member[]) => {
        let filteredMembers: Member[] = members.filter(
          (member: Member) =>
            (member.active || member.active == this.activeOnly) &&
            member.displayName
              .toLowerCase()
              .includes(this.nameFilter.toLowerCase())
        );
        if (filteredMembers.length > 0) {
          filteredMembers = this.sorter.sort(
            filteredMembers,
            this.sortField,
            this.sortAsc
          );
        }
        return filteredMembers;
      })
    );
  }

  sortMembers(e: { active: string; direction: string }): void {
    this.sortField = e.active;
    this.sortAsc = e.direction == 'asc';
    this.filterMembers();
  }

  clearSearch(): void {
    this.nameFilter = '';
    this.filterMembers();
  }

  onRowClick(member: Member): void {
    if (
      this.currentMember.groupAdmin ||
      this.currentUser.uid == member.userId
    ) {
      const dialogConfig: MatDialogConfig = {
        data: {
          groupId: this.currentGroup.id,
          userId: this.currentUser.uid,
          isGroupAdmin: this.currentMember.groupAdmin,
          member: member,
        },
      };
      const dialogRef = this.dialog.open(EditMemberComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((result) => {
        if (result.success) {
          this.snackBar.open(`Member ${result.operation}`, 'OK');
        }
      });
    }
  }
}
