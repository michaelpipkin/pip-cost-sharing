import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import firebase from 'firebase/compat/app';
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
  selector: 'app-memorized',
  templateUrl: './memorized.component.html',
  styleUrl: './memorized.component.scss',
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
export class MemorizedComponent implements OnInit {
  currentUser: firebase.User;
  currentGroup: Group;
  currentMember: Member;
  members: Member[];
  categories: Category[];
  expenses$: Observable<Expense[]>;
  filteredExpenses$: Observable<Expense[]>;
  selectedMemberId: string = '';
  selectedCategoryId: string = '';
  columnsToDisplay: string[] = [
    'paidBy',
    'description',
    'category',
    'amount',
    'create',
    'expand',
  ];
  splitColumnsToDisplay: string[] = ['empty1', 'owedBy', 'amount', 'empty2'];
  expandedExpense: Expense | null;

  constructor(
    private router: Router,
    private userService: UserService,
    private groupService: GroupService,
    private memberService: MemberService,
    private expenseService: ExpenseService,
    private splitService: SplitService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private loading: LoadingService
  ) {}

  ngOnInit(): void {
    if (this.groupService.getCurrentGroup() == null) {
      this.router.navigateByUrl('/groups');
    } else {
      this.currentUser = this.userService.getCurrentUser();
      this.currentGroup = this.groupService.getCurrentGroup();
      this.currentMember = this.memberService.getCurrentGroupMember();
      this.selectedMemberId = '';
      this.memberService
        .getAllGroupMembers(this.currentGroup.id)
        .pipe(
          tap((members: Member[]) => {
            this.members = members;
          })
        )
        .subscribe();
      this.categoryService
        .getCategoriesForGroup(this.currentGroup.id)
        .pipe(
          tap((categories: Category[]) => {
            this.categories = categories;
          })
        )
        .subscribe();
      this.loadMemorizedExpenses();
      this.filterExpenses();
    }
  }

  loadMemorizedExpenses(): void {
    this.loading.loadingOn();
    this.expenses$ = this.expenseService
      .getMemorizedExpensesWithSplitsForGroup(this.currentGroup.id)
      .pipe(tap(() => this.loading.loadingOff()));
  }

  filterExpenses(): void {
    this.splitService.getSplitsForGroup(this.currentGroup.id).subscribe();
    this.filteredExpenses$ = this.expenses$.pipe(
      map((expenses: Expense[]) => {
        let filteredExpenses: Expense[] = expenses.filter(
          (expense: Expense) =>
            expense.paidByMemberId ==
              (this.selectedMemberId != ''
                ? this.selectedMemberId
                : expense.paidByMemberId) &&
            expense.categoryId ==
              (this.selectedCategoryId != ''
                ? this.selectedCategoryId
                : expense.categoryId)
        );
        return filteredExpenses;
      })
    );
  }

  clearSelectedMember(): void {
    this.selectedMemberId = '';
    this.filterExpenses();
  }

  clearSelectedCategory(): void {
    this.selectedCategoryId = '';
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
        memorized: true,
        groupId: this.currentGroup.id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember.groupAdmin,
      },
    };
    const dialogRef = this.dialog.open(EditExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.snackBar.open(`Memorized expense ${res.operation}`, 'OK');
        this.filterExpenses();
      }
    });
  }

  addExpense(expense: Expense): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        groupId: this.currentGroup.id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember.groupAdmin,
        memorized: true,
        expense: expense,
      },
    };
    const dialogRef = this.dialog.open(AddExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result) => {
      if (result.success) {
        this.snackBar.open(`Memorized expense ${result.operation}`, 'OK');
        this.filterExpenses();
      }
    });
  }
}
