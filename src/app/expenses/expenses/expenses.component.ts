import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { FormsModule } from '@angular/forms';
import { MatIconButton, MatMiniFabButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { User } from '@models/user';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import firebase from 'firebase/compat/app';
import { map, Observable, tap } from 'rxjs';
import { AddExpenseComponent } from '../add-expense/add-expense.component';
import { EditExpenseComponent } from '../edit-expense/edit-expense.component';
import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  AsyncPipe,
  CommonModule,
  CurrencyPipe,
  DatePipe,
} from '@angular/common';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import {
  MatFormField,
  MatHint,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatFooterCell,
  MatFooterCellDef,
  MatFooterRow,
  MatFooterRowDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatNoDataRow,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
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
  standalone: true,
  imports: [
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    CommonModule,
    MatIconButton,
    MatSuffix,
    MatIcon,
    MatSlideToggle,
    MatInput,
    MatDatepickerInput,
    MatHint,
    MatDatepickerToggle,
    MatDatepicker,
    MatTable,
    MatSort,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatFooterCellDef,
    MatFooterCell,
    MatSortHeader,
    MatMiniFabButton,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatFooterRowDef,
    MatFooterRow,
    MatNoDataRow,
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    YesNoPipe,
  ],
})
export class ExpensesComponent implements OnInit {
  router = inject(Router);
  userService = inject(UserService);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  splitService = inject(SplitService);
  snackBar = inject(MatSnackBar);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  sorter = inject(SortingService);
  storage = inject(AngularFireStorage);
  analytics = inject(AngularFireAnalytics);

  user: WritableSignal<User> = this.userService.user;
  members: WritableSignal<Member[]> = this.memberService.allGroupMembers;
  categories: WritableSignal<Category[]> = this.categoryService.allCategories;
  currentGroup: WritableSignal<Group> = this.groupService.currentGroup;
  currentMember: WritableSignal<Member> = this.memberService.currentGroupMember;
  expenses: WritableSignal<Expense[]> = this.expenseService.groupExpenses;

  unpaidOnly = signal<boolean>(true);
  selectedMemberId = signal<string>('');
  selectedCategoryId = signal<string>('');
  sortField = signal<string>('date');
  sortAsc = signal<boolean>(true);
  startDate = signal<Date | null>(null);
  endDate = signal<Date | null>(null);

  filteredExpenses = computed(() => {
    var filteredExpenses = this.expenses().filter((expense: Expense) => {
      return (
        (!expense.paid || expense.paid != this.unpaidOnly()) &&
        expense.paidByMemberId ==
          (this.selectedMemberId() != ''
            ? this.selectedMemberId()
            : expense.paidByMemberId) &&
        expense.categoryId ==
          (this.selectedCategoryId() != ''
            ? this.selectedCategoryId()
            : expense.categoryId)
      );
    });
    if (this.startDate() !== undefined && this.startDate() !== null) {
      filteredExpenses = filteredExpenses.filter((expense: Expense) => {
        return expense.date.toDate() >= this.startDate();
      });
    }
    if (this.endDate() !== undefined && this.endDate() !== null) {
      filteredExpenses = filteredExpenses.filter((expense: Expense) => {
        return expense.date.toDate() <= this.endDate();
      });
    }
    if (filteredExpenses.length > 0) {
      filteredExpenses = this.sorter.sort(
        filteredExpenses,
        this.sortField(),
        this.sortAsc()
      );
    }
    this.expenseTotal = filteredExpenses.reduce(
      (total, e) => (total += e.totalAmount),
      0
    );
    return filteredExpenses;
  });

  receipts: string[] = [];
  expenseTotal: number = 0;

  selectedMemberIdValue: string = '';
  selectedCategoryIdValue: string = '';
  startDateValue: Date | null = null;
  endDateValue: Date | null = null;

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

  ngOnInit(): void {
    if (this.currentGroup() == null) {
      this.router.navigateByUrl('/groups');
    } else {
      this.getReceipts().subscribe();
    }
  }

  getReceipts(): Observable<any> {
    return this.storage
      .ref(`groups/${this.currentGroup().id}/receipts/`)
      .list()
      .pipe(
        map((res) => {
          res.items.forEach((file) => {
            this.receipts.push(file.name);
          });
        })
      );
  }

  unpaidOnlyToggle(unpaidOnly: boolean) {
    this.unpaidOnly.set(unpaidOnly);
  }

  selectedMemberChange() {
    this.selectedMemberId.set(this.selectedMemberIdValue);
  }

  clearSelectedMember(): void {
    this.selectedMemberId.set('');
    this.selectedMemberIdValue = '';
  }

  selectCategoryChange() {
    this.selectedCategoryId.set(this.selectedCategoryIdValue);
  }

  clearSelectedCategory(): void {
    this.selectedCategoryId.set('');
    this.selectedCategoryIdValue = '';
  }

  startDateChange() {
    this.startDate.set(this.startDateValue);
  }

  clearStartDate(): void {
    this.startDate.set(null);
    this.startDateValue = null;
  }

  endDateChange() {
    this.endDate.set(this.endDateValue);
  }

  clearEndDate(): void {
    this.endDate.set(null);
    this.endDateValue = null;
  }

  sortExpenses(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
    this.sortAsc.set(e.direction == 'asc');
  }

  getMemberName(memberId: string): string {
    const member = this.members().find((m) => m.id === memberId);
    return !!member ? member.displayName : '';
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories().find((c) => c.id === categoryId);
    return !!category ? category.name : '';
  }

  onRowClick(expense: Expense): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        expense: expense,
        memorized: false,
        groupId: this.currentGroup().id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember().groupAdmin,
      },
    };
    const dialogRef = this.dialog.open(EditExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.getReceipts().subscribe();
        this.snackBar.open(`Expense ${res.operation}`, 'OK');
      }
    });
  }

  addExpense(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        groupId: this.currentGroup().id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember().groupAdmin,
        memorized: false,
      },
    };
    const dialogRef = this.dialog.open(AddExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.getReceipts().subscribe();
        this.snackBar.open(`Expense ${res.operation}`, 'OK');
      }
    });
  }

  markSplitPaidUnpaid(split: Split): void {
    const changes = {
      paid: !split.paid,
    };
    this.splitService
      .updateSplit(this.currentGroup().id, split.id, changes)
      .subscribe();
  }
}
