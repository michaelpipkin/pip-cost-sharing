import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Member } from '@models/member';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { MemberService } from '@services/member.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-expenses',
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
})
export class ExpensesComponent implements OnChanges {
  @Input() groupId: string = '';
  members$: Observable<Member[]>;
  expenses$: Observable<Expense[]>;
  categories$: Observable<Category[]>;

  constructor(
    private expenseService: ExpenseService,
    private memberService: MemberService,
    private categoryService: CategoryService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.loadData();
  }

  loadData(): void {
    this.expenses$ = this.expenseService.getExpensesForGroup(this.groupId);
    this.members$ = this.memberService.getAllGroupMembers(this.groupId);
    this.categories$ = this.categoryService.getCategoriesForGroup(this.groupId);
  }

  getMemberName(members: Member[], memberId: string) {
    return members.find((m) => m.id === memberId).displayName;
  }

  getCategoryName(categories: Category[], categoryId: string) {
    return categories.find((c) => c.id === categoryId).name;
  }
}
