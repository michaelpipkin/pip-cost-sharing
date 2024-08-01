import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { HelpComponent } from '@components/help/help.component';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SplitService } from '@services/split.service';
import { LoadingService } from '@shared/loading/loading.service';
import { AddExpenseComponent } from '../add-expense/add-expense.component';
import { EditExpenseComponent } from '../edit-expense/edit-expense.component';
import {
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
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
  standalone: true,
  imports: [
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    MatIconButton,
    MatSuffix,
    MatIcon,
    MatTooltip,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatNoDataRow,
    CurrencyPipe,
  ],
})
export class MemorizedComponent {
  router = inject(Router);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  splitService = inject(SplitService);
  snackBar = inject(MatSnackBar);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);

  categories: Signal<Category[]> = this.categoryService.groupCategories;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  currentMember: Signal<Member> = this.memberService.currentMember;
  expenses: Signal<Expense[]> = this.expenseService.memorizedExpenses;
  activeMembers: Signal<Member[]> = this.memberService.activeGroupMembers;

  filteredExpenses = computed<Expense[]>(() => {
    var filteredExpenses = this.expenses().filter((expense: Expense) => {
      return (
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
    return filteredExpenses;
  });

  selectedMemberId = model<string>('');
  selectedCategoryId = model<string>('');
  expandedExpense = model<Expense | null>(null);

  onExpandClick(expense: Expense) {
    this.expandedExpense.update((e) => (e === expense ? null : expense));
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'memorized',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }

  getMemberName(memberId: string): string {
    const member = this.activeMembers().find((m: Member) => m.id === memberId);
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
        memorized: true,
        groupId: this.currentGroup().id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember().groupAdmin,
      },
    };
    const dialogRef = this.dialog.open(EditExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.snackBar.open(`Memorized expense ${res.operation}`, 'OK');
      }
    });
  }

  addMemorizedExpense() {
    const dialogConfig: MatDialogConfig = {
      data: {
        groupId: this.currentGroup().id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember().groupAdmin,
        memorized: true,
      },
    };
    const dialogRef = this.dialog.open(AddExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.snackBar.open(`Memorized expense ${res.operation}`, 'OK');
      }
    });
  }

  addExpense(expense: Expense): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        groupId: this.currentGroup().id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember().groupAdmin,
        memorized: true,
        expense: expense,
      },
    };
    const dialogRef = this.dialog.open(AddExpenseComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result) => {
      if (result.success) {
        this.snackBar.open(`Expense ${result.operation}`, 'OK');
      }
    });
  }
}
