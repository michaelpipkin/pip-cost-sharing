import { BreakpointObserver } from '@angular/cdk/layout';
import { CurrencyPipe, DatePipe } from '@angular/common';
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
import { ExpenseService } from '@services/expense.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { ClearSelectDirective } from '@shared/directives/clear-select.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { YesNoNaPipe } from '@shared/pipes/yes-no-na.pipe';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store.';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { getAnalytics } from 'firebase/analytics';
import { getStorage } from 'firebase/storage';
import { ExpensesHelpComponent } from '../expenses-help/expenses-help.component';
import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
import {
  Component,
  computed,
  inject,
  model,
  OnInit,
  signal,
  Signal,
} from '@angular/core';

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
    ClearSelectDirective,
    RouterLink,
  ],
})
export class ExpensesComponent implements OnInit {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly expenseService = inject(ExpenseService);
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
  expenses: Signal<Expense[]> = this.expenseStore.groupExpenses;

  sortField = signal<string>('date');
  sortAsc = signal<boolean>(true);

  unpaidOnly = model<boolean>(true);
  selectedMemberId = model<string>('');
  selectedCategoryId = model<string>('');
  startDate = model<Date | null>(null);
  endDate = model<Date | null>(null);

  filteredExpenses = computed(
    (
      unpaidOnly: boolean = this.unpaidOnly(),
      selectedMemberId: string = this.selectedMemberId(),
      selectedCategoryId: string = this.selectedCategoryId()
    ) => {
      var filteredExpenses = this.expenses().filter((expense: Expense) => {
        return (
          (!expense.paid || expense.paid != unpaidOnly) &&
          expense.paidByMemberId ==
            (selectedMemberId != ''
              ? selectedMemberId
              : expense.paidByMemberId) &&
          expense.categoryId ==
            (selectedCategoryId != '' ? selectedCategoryId : expense.categoryId)
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
      return filteredExpenses;
    }
  );

  expenseTotal = computed(() =>
    this.filteredExpenses().reduce((total, e) => (total += +e.totalAmount), 0)
  );

  expandedExpense = model<Expense | null>(null);

  columnsToDisplay = signal<string[]>([]);
  smallScreen = signal<boolean>(false);

  ngOnInit(): void {
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
  }

  onExpandClick(expense: Expense) {
    this.expandedExpense.update((e) => (e === expense ? null : expense));
  }

  sortExpenses(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
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
    this.router.navigate(['/edit-expense', expense.id]);
  }

  markSplitPaidUnpaid(expense: Expense, split: Split): void {
    const changes = {
      paid: !split.paid,
    };
    this.loading.loadingOn();
    this.splitService
      .updateSplit(this.currentGroup().id, expense.id, split.id, changes)
      .then(() => this.loading.loadingOff());
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(ExpensesHelpComponent, dialogConfig);
  }
}
