import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
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
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { LocaleService } from '@services/locale.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { TourService } from '@services/tour.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { YesNoNaPipe } from '@shared/pipes/yes-no-na.pipe';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { DateUtils } from '@utils/date-utils.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getStorage } from 'firebase/storage';
import {
  AfterViewInit,
  Component,
  computed,
  effect,
  inject,
  model,
  OnInit,
  signal,
  Signal,
} from '@angular/core';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '../../help/help-dialog/help-dialog.component';

@Component({
  selector: 'app-expenses',
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
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
    DateShortcutKeysDirective,
  ],
})
export class ExpensesComponent implements OnInit, AfterViewInit {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly demoService = inject(DemoService);
  protected readonly tourService = inject(TourService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly loadingService = inject(LoadingService);
  protected readonly splitService = inject(SplitService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly router = inject(Router);
  protected readonly loading = inject(LoadingService);
  protected readonly sorter = inject(SortingService);
  protected readonly localeService = inject(LocaleService);
  protected readonly breakpointObserver = inject(BreakpointObserver);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  currentMember: Signal<Member> = this.memberStore.currentMember;
  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;

  expenses = signal<Expense[]>([]);
  isLoaded = signal<boolean>(false);

  sortField = signal<string>('date');
  sortAsc = signal<boolean>(true);

  constructor() {
    // Watch for store data changes and auto-load demo expenses
    effect(() => {
      if (this.userStore.isDemoMode()) {
        const storeExpenses = this.expenseStore.groupExpenses();
        const storeLoaded = this.expenseStore.loaded();
        if (
          storeExpenses.length > 0 &&
          storeLoaded &&
          this.expenses().length === 0
        ) {
          this.expenses.set(storeExpenses);
          this.isLoaded.set(true);
          console.log(
            'Auto-loaded demo expenses from store:',
            storeExpenses.length
          );
        }
      } else {
        // Clear demo expenses when switching to real user mode
        if (this.expenses().length > 0 && !this.currentGroup()) {
          console.log('Clearing demo expenses - user logged in');
          this.expenses.set([]);
          this.isLoaded.set(false);
        }
      }
    });

    // Watch for currentGroup to become available and load expenses
    effect(() => {
      const group = this.currentGroup();
      if (group && !this.isLoaded() && !this.userStore.isDemoMode()) {
        this.loadExpenses();
      }
    });
  }

  searchText = model<string>('');
  searchFocused = model<boolean>(false);
  unpaidOnly = model<boolean>(true);
  startDate = model<Date | null>(
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  ); // 90 days ago
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
  footerColumnsToDisplay = signal<string[]>([]);
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
          this.footerColumnsToDisplay.set(['amount', 'receipt-paid', 'expand']);
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
          this.footerColumnsToDisplay.set([
            'amount',
            'receipt',
            'paid',
            'expand',
          ]);
          this.smallScreen.set(false);
        }
      });

    // If currentGroup is already set (e.g., coming from another page), load expenses immediately
    // Otherwise, the effect in the constructor will load them when the group becomes available
    if (this.currentGroup() && !this.userStore.isDemoMode()) {
      await this.loadExpenses();
    }
  }

  ngAfterViewInit(): void {
    // Check if we should auto-start the expenses tour
    this.tourService.checkForContinueTour('expenses');
  }

  async loadExpenses(): Promise<void> {
    this.loading.loadingOn();
    try {
      // Check if we have store data (demo mode) first
      const storeExpenses = this.expenseStore.groupExpenses();
      if (
        this.userStore.isDemoMode() &&
        storeExpenses.length > 0 &&
        this.expenseStore.loaded()
      ) {
        // Use demo/store data
        this.expenses.set(storeExpenses);
        this.isLoaded.set(true);
      } else {
        // Fall back to Firebase service
        const expenses: Expense[] =
          await this.expenseService.getGroupExpensesByDateRange(
            this.currentGroup().id,
            this.startDate(),
            this.endDate()
          );
        this.expenses.set(expenses);
        this.isLoaded.set(true);
      }
    } catch (error) {
      logEvent(this.analytics, 'fetch_expenses_error', {
        error: error.message,
      });
    } finally {
      this.loading.loadingOff();
    }
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

  onAddExpenseClick(): void {
    this.loading.loadingOn();
    if (this.demoService.isInDemoMode()) {
      this.router.navigate(['/demo/expenses/add']);
    } else {
      this.router.navigate(['/expenses/add']);
    }
  }

  onRowClick(expense: Expense): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    this.loading.loadingOn();
    this.router.navigate(['/expenses', expense.id]);
  }

  async markSplitPaidUnpaid(expense: Expense, split: Split): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const changes = {
      paid: !split.paid,
    };
    this.loading.loadingOn();
    try {
      await this.splitService.updateSplit(
        this.currentGroup().id,
        expense.ref,
        split.ref,
        changes
      );
      this.loadExpenses();
      this.snackBar.open(
        `Split ${!split.paid ? 'marked as paid' : 'marked as unpaid'}`,
        'Close',
        { duration: 3000 }
      );
    } finally {
      this.loading.loadingOff();
    }
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'expenses' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    // Force start the Expenses Tour (ignoring completion state)
    this.tourService.startExpensesTour(true);
  }

  async copyExpenseSummaryToClipboard(expense: Expense): Promise<void> {
    const summaryText = this.generateExpenseSummaryText(expense);
    try {
      await navigator.clipboard.writeText(summaryText);
      this.snackBar.open('Expense summary copied to clipboard', 'OK', {
        duration: 2000,
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'copy_expense_summary_to_clipboard',
          message: error.message,
        });
      } else {
        this.snackBar.open('Failed to copy expense summary', 'OK', {
          duration: 2000,
        });
      }
    }
  }

  getDateOnly(expense: Expense): Date {
    return DateUtils.getDateOnly(expense.date);
  }

  private generateExpenseSummaryText(expense: Expense): string {
    const date = DateUtils.getDateOnly(expense.date).toLocaleDateString();

    let summaryText = `Date: ${date}\n`;
    summaryText += `Description: ${expense.description}\n`;
    summaryText += `Category: ${expense.category.name}\n`;
    summaryText += `Paid by: ${expense.paidByMember.displayName}\n`;
    summaryText += `Total: ${this.formatCurrency(expense.totalAmount)}\n`;

    // Add breakdown information similar to split component
    if (!expense.splitByPercentage && expense.sharedAmount > 0) {
      summaryText += `Evenly shared amount: ${this.formatCurrency(expense.sharedAmount)}\n`;
    }

    if (!expense.splitByPercentage && expense.allocatedAmount > 0) {
      summaryText += `Proportional amount (tax, tip, etc.): ${this.formatCurrency(expense.allocatedAmount)}\n`;
    }

    // Collect all lines for alignment calculation
    const splitLines: { text: string; amount: string; isIndented: boolean }[] =
      [];

    // First pass: collect all lines and calculate max lengths
    expense.splits.forEach((split) => {
      const owedBy = split.owedByMember.displayName;
      // Only show paid status if the person who owes is different from the person who paid
      const showPaidStatus = !expense.paidByMemberRef.eq(split.owedByMemberRef);
      const paidStatus = showPaidStatus
        ? split.paid
          ? ' (Paid)'
          : ' (Unpaid)'
        : '';

      if (expense.splitByPercentage) {
        // Show percentage and total for percentage splits
        const lineText = `${owedBy}${paidStatus} (${split.percentage}%)`;
        const amount = this.formatCurrency(split.allocatedAmount);
        splitLines.push({ text: lineText, amount, isIndented: false });
      } else {
        // Show detailed breakdown for dollar amount splits
        const assignedAmount = split.assignedAmount || 0;
        const proportionalAmount = this.calculateProportionalAmountForSplit(
          expense,
          split
        );
        const sharedPortionAmount =
          this.calculateSharedPortionForSplit(expense);

        // Main split line
        splitLines.push({
          text: `${owedBy}${paidStatus}`,
          amount: this.formatCurrency(split.allocatedAmount),
          isIndented: false,
        });

        // Breakdown lines (indented)
        if (assignedAmount > 0) {
          splitLines.push({
            text: '  Personal',
            amount: this.formatCurrency(assignedAmount),
            isIndented: true,
          });
        }
        if (sharedPortionAmount > 0) {
          splitLines.push({
            text: '  Shared',
            amount: this.formatCurrency(sharedPortionAmount),
            isIndented: true,
          });
        }
        if (proportionalAmount > 0) {
          splitLines.push({
            text: '  Proportional',
            amount: this.formatCurrency(proportionalAmount),
            isIndented: true,
          });
        }
      }
    });

    // Calculate max line lengths for alignment
    let maxMainLineLength = 0;
    let maxIndentedLineLength = 0;

    splitLines.forEach((line) => {
      const lineLength = line.text.length + 2 + line.amount.length; // +2 for ": "
      if (line.isIndented) {
        maxIndentedLineLength = Math.max(maxIndentedLineLength, lineLength);
      } else {
        maxMainLineLength = Math.max(maxMainLineLength, lineLength);
      }
    });

    // Use the overall maximum for better alignment when we have mixed line types
    const overallMaxLength = Math.max(maxMainLineLength, maxIndentedLineLength);

    summaryText += `${'='.repeat(overallMaxLength + 1)}\n`;

    // Second pass: add properly aligned lines
    splitLines.forEach((line) => {
      const spacesNeeded =
        overallMaxLength - line.text.length - line.amount.length;
      const padding = ' '.repeat(spacesNeeded);
      summaryText += `${line.text}:${padding}${line.amount}\n`;
    });

    return summaryText.trim();
  }

  // Helper methods to calculate breakdown amounts for existing expenses
  private calculateProportionalAmountForSplit(
    expense: Expense,
    split: Split
  ): number {
    if (expense.allocatedAmount === 0) return 0;

    const baseAmount: number = expense.totalAmount - expense.allocatedAmount;
    const evenlySharedAmount: number =
      expense.sharedAmount / expense.splits.length;

    if (baseAmount === 0) return 0;

    const memberProportionalAmount: number =
      (((split.assignedAmount || 0) + evenlySharedAmount) / baseAmount) *
      expense.allocatedAmount;

    return this.localeService.roundToCurrency(+memberProportionalAmount);
  }

  private calculateSharedPortionForSplit(expense: Expense): number {
    if (expense.sharedAmount === 0 || expense.splits.length === 0) return 0;
    return this.localeService.roundToCurrency(
      +(expense.sharedAmount / expense.splits.length)
    );
  }

  // Helper method to format currency
  private formatCurrency(amount: number): string {
    return this.localeService.formatCurrency(amount);
  }
}
