import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Member } from '@models/member';
import { MemberService } from '@services/member.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-members',
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
})
export class MembersComponent implements OnChanges {
  @Input() groupId: string = '';
  members$: Observable<Member[]>;

  constructor(private memberService: MemberService) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.loadMembers();
  }

  loadMembers(): void {
    this.members$ = this.memberService.getAllGroupMembers(this.groupId);
  }
}
