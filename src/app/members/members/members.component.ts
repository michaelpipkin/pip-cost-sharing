import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Member } from '@models/member';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { map, Observable } from 'rxjs';

@Component({
  selector: 'app-members',
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
})
export class MembersComponent implements OnChanges {
  @Input() groupId: string = '';
  members$: Observable<Member[]>;
  filteredMembers$: Observable<Member[]>;
  activeOnly: boolean = false;
  nameFilter: string = '';
  sortField: string = 'displayName';
  sortAsc: boolean = true;
  columnsToDisplay: string[] = ['displayName', 'activeText', 'groupAdminText'];

  constructor(
    private memberService: MemberService,
    private sorter: SortingService
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

  onRowClick(member: Member): void {}
}
