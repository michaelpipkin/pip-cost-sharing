import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { map, Observable, tap } from 'rxjs';
import { AddExpenseComponent } from '../add-expense/add-expense.component';
import { EditExpenseComponent } from '../edit-expense/edit-expense.component';
import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';

@Component({
  selector: 'app-expenses',
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition(
        'expanded <=> collapsed',
        animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')
      ),
    ]),
  ],
})
export class ExpensesComponent implements OnChanges {
  @Input() groupId: string = '';
  @Input() currentMember: Member;
  @Input() isGroupAdmin: boolean = false;
  members: Member[];
  categories: Category[];
  expenses$: Observable<Expense[]>;
  filteredExpenses$: Observable<Expense[]>;
  unpaidOnly: boolean = true;
  selectedMemberId: string = '';
  sortField: string = 'date';
  sortAsc: boolean = true;
  columnsToDisplay: string[] = [
    'date',
    'paidBy',
    'amount',
    'description',
    'category',
    'paid',
    'expand',
  ];
  splitColumnsToDisplay: string[] = ['owedBy', 'amount', 'paid', 'mark'];
  expandedExpense: Expense | null;

  constructor(
    private expenseService: ExpenseService,
    private splitService: SplitService,
    private memberService: MemberService,
    private categoryService: CategoryService,
    private sorter: SortingService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.selectedMemberId = '';
    this.unpaidOnly = true;
    this.memberService
      .getAllGroupMembers(this.groupId)
      .pipe(
        tap((members: Member[]) => {
          this.members = members;
        })
      )
      .subscribe();
    this.categoryService
      .getCategoriesForGroup(this.groupId)
      .pipe(
        tap((categories: Category[]) => {
          this.categories = categories;
        })
      )
      .subscribe();
    this.expenses$ = this.expenseService.getExpensesWithSplitsForGroup(
      this.groupId
    );
    this.filterExpenses();
  }

  filterExpenses(): void {
    this.splitService.getSplitsForGroup(this.groupId).subscribe();
    this.filteredExpenses$ = this.expenses$.pipe(
      map((expenses: Expense[]) => {
        let filteredExpenses: Expense[] = expenses.filter(
          (expense: Expense) =>
            (!expense.paid || expense.paid != this.unpaidOnly) &&
            expense.paidByMemberId ==
              (this.selectedMemberId != ''
                ? this.selectedMemberId
                : expense.paidByMemberId)
        );
        if (filteredExpenses.length > 0) {
          filteredExpenses = this.sorter.sort(
            filteredExpenses,
            this.sortField,
            this.sortAsc
          );
        }
        return filteredExpenses;
      })
    );
  }

  sortExpenses(e: { active: string; direction: string }): void {
    this.sortField = e.active;
    this.sortAsc = e.direction == 'asc';
    this.filterExpenses();
  }

  clearSelectedMember(): void {
    this.selectedMemberId = '';
    this.filterExpenses();
  }

  getMemberName(memberId: string): string {
    const member = this.members.find((m) => m.id === memberId);
    return !!member ? member.displayName : '';
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories.find((c) => c.id === categoryId);
    return !!category ? category.name : '';
  }

  onRowClick(expense: Expense): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        expense: expense,
        groupId: this.groupId,
        member: this.currentMember,
        isGroupAdmin: this.isGroupAdmin,
      },
      width: '850px',
    };
    const dialogRef = this.dialog.open(EditExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.snackBar.open(`Expense ${res.operation}`, 'OK');
        this.filterExpenses();
      }
    });
  }

  addExpense(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        groupId: this.groupId,
        member: this.currentMember,
        isGroupAdmin: this.isGroupAdmin,
      },
      width: '850px',
    };
    const dialogRef = this.dialog.open(AddExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Expense added', 'OK');
        this.filterExpenses();
      }
    });
  }

  markSplitPaidUnpaid(split: Split): void {
    const changes = {
      paid: !split.paid,
    };
    this.splitService
      .updateSplit(this.groupId, split.expenseId, split.id, changes)
      .subscribe();
    this.filterExpenses();
  }
}
