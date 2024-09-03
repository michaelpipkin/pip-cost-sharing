import { CurrencyPipe, DatePipe } from '@angular/common';
import { Analytics } from '@angular/fire/analytics';
import { Storage } from '@angular/fire/storage';
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
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { HelpComponent } from '@components/help/help.component';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { ClearSelectDirective } from '@shared/directives/clear-select.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { YesNoNaPipe } from '@shared/pipes/yes-no-na.pipe';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import { AddExpenseComponent } from '../add-expense/add-expense.component';
import { EditExpenseComponent } from '../edit-expense/edit-expense.component';
import {
  Component,
  computed,
  inject,
  signal,
  Signal,
  model,
} from '@angular/core';
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
    MatIconButton,
    MatTooltip,
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
    CurrencyPipe,
    DatePipe,
    YesNoPipe,
    YesNoNaPipe,
    ClearSelectDirective,
  ],
})
export class ExpensesComponent {
  router = inject(Router);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  splitService = inject(SplitService);
  snackBar = inject(MatSnackBar);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  sorter = inject(SortingService);
  storage = inject(Storage);
  analytics = inject(Analytics);

  members: Signal<Member[]> = this.memberService.groupMembers;
  categories: Signal<Category[]> = this.categoryService.groupCategories;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  currentMember: Signal<Member> = this.memberService.currentMember;
  expenses: Signal<Expense[]> = this.expenseService.groupExpenses;

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

  onExpandClick(expense: Expense) {
    this.expandedExpense.update((e) => (e === expense ? null : expense));
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'expenses',
        title: 'Expenses Help',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
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
        this.snackBar.open(`Expense ${res.operation}`, 'OK');
      }
    });
  }

  markSplitPaidUnpaid(split: Split): void {
    const changes = {
      paid: !split.paid,
    };
    this.loading.loadingOn();
    this.splitService
      .updateSplit(this.currentGroup().id, split.id, changes)
      .then(() => this.loading.loadingOff());
  }
}
