import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '@models/member';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import firebase from 'firebase/compat/app';
import { map, Observable, tap } from 'rxjs';
import { EditMemberComponent } from '../edit-member/edit-member.component';

@Component({
  selector: 'app-members',
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
})
export class MembersComponent implements OnChanges {
  @Input() groupId: string = '';
  @Input() currentUser: firebase.User;
  @Input() isGroupAdmin: boolean = false;
  members$: Observable<Member[]>;
  filteredMembers$: Observable<Member[]>;
  activeOnly: boolean = false;
  nameFilter: string = '';
  sortField: string = 'displayName';
  sortAsc: boolean = true;
  columnsToDisplay: string[] = ['displayName', 'active', 'groupAdmin'];

  constructor(
    private memberService: MemberService,
    private sorter: SortingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.loadMembers();
    this.filterMembers();
  }

  loadMembers(): void {
    this.members$ = this.memberService.getAllGroupMembers(this.groupId);
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
    if (this.isGroupAdmin || this.currentUser.uid == member.userId) {
      const dialogConfig: MatDialogConfig = {
        data: {
          userId: this.currentUser.uid,
          isGroupAdmin: this.isGroupAdmin,
          member: member,
        },
      };
      const dialogRef = this.dialog.open(EditMemberComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((result) => {
        if (result.success) {
          this.snackBar.open(`Member ${result.operation}`, 'OK');
          this.loadMembers();
          this.filterMembers();
        }
      });
    }
  }
}
