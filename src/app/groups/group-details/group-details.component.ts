import { Component, Input, OnInit } from '@angular/core';
import { ExpenseService } from '@services/expense.service';
import { MemberService } from '@services/member.service';

@Component({
  selector: 'app-group-details',
  templateUrl: './group-details.component.html',
  styleUrl: './group-details.component.scss',
})
export class GroupDetailsComponent implements OnInit {
  @Input() selectedGroupId: string;

  constructor(
    private memberService: MemberService,
    private expenseService: ExpenseService
  ) {}

  ngOnInit(): void {}
}
