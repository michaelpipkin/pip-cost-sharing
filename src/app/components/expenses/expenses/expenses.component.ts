import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  computed,
  inject,
  model,
  OnInit,
  signal,
  Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { YesNoNaPipe } from '@shared/pipes/yes-no-na.pipe';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getStorage } from 'firebase/storage';
import { ExpensesHelpComponent } from '../expenses-help/expenses-help.component';

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
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
    MatOptionModule,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatTooltipModule,
    MatIconModule,
    MatSlideToggleModule,
    MatInputModule,
    MatDatepickerModule,
    CurrencyPipe,
    DatePipe,
    YesNoPipe,
    YesNoNaPipe,
    RouterLink,
    DateShortcutKeysDirective,
  ],
})
export class ExpensesComponent implements OnInit {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly loadingService = inject(LoadingService);
  protected readonly splitService = inject(SplitService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly sorter = inject(SortingService);
  protected readonly breakpointObserver = inject(BreakpointObserver);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  currentMember: Signal<Member> = this.memberStore.currentMember;
  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;

  expenses = signal<Expense[]>([]);
  initialLoad = signal<boolean>(true);
  sortField = signal<string>('date');
  sortAsc = signal<boolean>(true);

  searchText = model<string>('');
  searchFocused = model<boolean>(false);
  unpaidOnly = model<boolean>(true);
  startDate = model<Date | null>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ); // 30 days ago
  endDate = model<Date | null>(null);

  filteredExpenses = computed(
    (
      unpaidOnly: boolean = this.unpaidOnly(),
      searchText: string = this.searchText()
    ) => {
      var filteredExpenses = this.expenses().filter((expense: Expense) => {
        return (
          (!expense.paid || expense.paid != unpaidOnly) &&
          (!searchText ||
            expense.description
              .toLowerCase()
              .includes(searchText.toLowerCase()) ||
            this.members()
              .find((m) => m.ref.eq(expense.paidByMemberRef))
              ?.displayName.toLowerCase()
              .includes(searchText.toLowerCase()) ||
            this.categories()
              .find((c) => c.ref.eq(expense.categoryRef))
              ?.name.toLowerCase()
              .includes(searchText.toLowerCase()))
        );
      });
      if (filteredExpenses.length > 0) {
        filteredExpenses = this.sorter.sort(
          filteredExpenses,
          this.sortField(),
          this.sortAsc()
        );
      }
      return filteredExpenses;
    }
  );

  expenseTotal = computed(() =>
    this.filteredExpenses().reduce((total, e) => (total += +e.totalAmount), 0)
  );

  expandedExpense = model<Expense | null>(null);

  columnsToDisplay = signal<string[]>([]);
  smallScreen = signal<boolean>(false);

  async ngOnInit(): Promise<void> {
    this.breakpointObserver
      .observe('(max-width: 1009px)')
      .subscribe((result) => {
        if (result.matches) {
          this.columnsToDisplay.set([
            'date-paidBy',
            'description-category',
            'amount',
            'receipt-paid',
            'expand',
          ]);
          this.smallScreen.set(true);
        } else {
          this.columnsToDisplay.set([
            'date',
            'paidBy',
            'description',
            'category',
            'amount',
            'receipt',
            'paid',
            'expand',
          ]);
          this.smallScreen.set(false);
        }
      });
    await this.loadExpenses().finally(() => {
      this.initialLoad.set(false);
    });
  }

  async loadExpenses(): Promise<void> {
    this.loading.loadingOn();
    await this.expenseService
      .getGroupExpensesByDateRange(
        this.currentGroup().id,
        this.startDate(),
        this.endDate()
      )
      .then((expenses: Expense[]) => {
        this.expenses.set(expenses);
      })
      .catch((error) => {
        logEvent(this.analytics, 'fetch_expenses_error', {
          error: error.message,
        });
      })
      .finally(() => {
        this.loading.loadingOff();
      });
  }

  onFetchExpensesClick(): void {
    if (!this.startDate() && !this.endDate()) {
      const dialogConfig: MatDialogConfig = {
        data: {
          dialogTitle: 'Confirm Fetch All Expenses',
          confirmationText:
            'Fetching all expenses with no start or end date may take a long time. Are you sure you want to continue?',
          cancelButtonText: 'No',
          confirmButtonText: 'Yes',
        },
      };
      const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((confirm) => {
        if (confirm) {
          this.loadExpenses();
        }
      });
    } else {
      this.loadExpenses();
    }
  }

  onSearchFocus() {
    this.searchFocused.set(true);
  }

  onSearchBlur() {
    if (!this.searchText()) {
      this.searchFocused.set(false);
    }
  }

  onExpandClick(expense: Expense) {
    this.expandedExpense.update((e) => (e === expense ? null : expense));
  }

  sortExpenses(e: { active: string; direction: string }): void {
    // this.sortField.set(e.active);
    this.sortAsc.set(e.direction == 'asc');
  }

  getMemberName(memberId: string): string {
    const member = this.members().find((m) => m.id === memberId);
    return member?.displayName ?? '';
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories().find((c) => c.id === categoryId);
    return category?.name ?? '';
  }

  onRowClick(expense: Expense): void {
    this.loading.loadingOn();
    this.router.navigate(['/expenses', expense.id]);
  }

  async markSplitPaidUnpaid(expense: Expense, split: Split): Promise<void> {
    const changes = {
      paid: !split.paid,
    };
    this.loading.loadingOn();
    await this.splitService
      .updateSplit(this.currentGroup().id, expense.ref, split.ref, changes)
      .then(() => {
        const splits = this.expandedExpense().splits;
        const updatedSplit = splits.find((s) => s.ref.eq(split.ref));
        updatedSplit.paid = !updatedSplit.paid;
        this.onExpandClick(expense);
        this.snackBar.open(
          `Split ${updatedSplit.paid ? 'marked as paid' : 'marked as unpaid'}`,
          'Close',
          { duration: 3000 }
        );
      })
      .finally(() => {
        this.loading.loadingOff();
      });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(ExpensesHelpComponent, dialogConfig);
  }
}
