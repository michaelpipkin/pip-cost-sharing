import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { AngularFireStorage } from '@angular/fire/compat/storage';
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
  @Input() currentMember: Member;
  @Input() isGroupAdmin: boolean = false;
  @Input() groupId: string = '';
  @Input() selectedTab: number;
  members: Member[];
  categories: Category[];
  expenses$: Observable<Expense[]>;
  filteredExpenses$: Observable<Expense[]>;
  receipts: string[] = [];
  unpaidOnly: boolean = true;
  selectedMemberId: string = '';
  selectedCategoryId: string = '';
  expenseTotal: number = 0;
  sortField: string = 'date';
  sortAsc: boolean = true;
  startDate: Date | null;
  endDate: Date | null;
  columnsToDisplay: string[] = [
    'date',
    'paidBy',
    'description',
    'category',
    'amount',
    'receipt',
    'paid',
    'expand',
  ];
  splitColumnsToDisplay: string[] = [
    'empty1',
    'owedBy',
    'amount',
    'paid',
    'mark',
    'empty2',
  ];
  expandedExpense: Expense | null;

  constructor(
    private expenseService: ExpenseService,
    private splitService: SplitService,
    private memberService: MemberService,
    private categoryService: CategoryService,
    private sorter: SortingService,
    private storage: AngularFireStorage,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.expenses$ = this.expenseService.getExpensesWithSplitsForGroup(
      this.groupId
    );
    if (!!changes.groupId) {
      this.groupId = changes.groupId.currentValue;
    }
    this.selectedMemberId = '';
    this.unpaidOnly = true;
    this.getReceipts();
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
    this.filterExpenses();
  }

  getReceipts(): Observable<any> {
    return this.storage
      .ref(`groups/${this.groupId}/receipts/`)
      .list()
      .pipe(
        map((res) => {
          res.items.forEach((file) => {
            this.receipts.push(file.name);
          });
        })
      );
  }

  filterExpenses(): void {
    this.getReceipts().subscribe();
    this.splitService.getSplitsForGroup(this.groupId).subscribe();
    this.filteredExpenses$ = this.expenses$.pipe(
      map((expenses: Expense[]) => {
        let filteredExpenses: Expense[] = expenses.filter(
          (expense: Expense) =>
            (!expense.paid || expense.paid != this.unpaidOnly) &&
            expense.paidByMemberId ==
              (this.selectedMemberId != ''
                ? this.selectedMemberId
                : expense.paidByMemberId) &&
            expense.categoryId ==
              (this.selectedCategoryId != ''
                ? this.selectedCategoryId
                : expense.categoryId)
        );
        if (this.startDate !== undefined && this.startDate !== null) {
          filteredExpenses = filteredExpenses.filter(
            (expense: Expense) => expense.date.toDate() >= this.startDate
          );
        }
        if (this.endDate !== undefined && this.endDate !== null) {
          filteredExpenses = filteredExpenses.filter(
            (expense: Expense) => expense.date.toDate() <= this.endDate
          );
        }
        if (filteredExpenses.length > 0) {
          filteredExpenses = this.sorter.sort(
            filteredExpenses,
            this.sortField,
            this.sortAsc
          );
        }
        this.expenseTotal = filteredExpenses.reduce(
          (total, e) => (total += e.totalAmount),
          0
        );
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

  clearSelectedCategory(): void {
    this.selectedCategoryId = '';
    this.filterExpenses();
  }

  clearStartDate(): void {
    this.startDate = null;
    this.filterExpenses();
  }

  clearEndDate(): void {
    this.endDate = null;
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
        memorized: false,
        groupId: this.groupId,
        member: this.currentMember,
        isGroupAdmin: this.isGroupAdmin,
      },
      width: '90vh',
    };
    const dialogRef = this.dialog.open(EditExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.snackBar.open(`${res.operation}`, 'OK');
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
        memorized: false,
      },
      width: '90vh',
    };
    const dialogRef = this.dialog.open(AddExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.snackBar.open(`${res.operation}`, 'OK');
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
