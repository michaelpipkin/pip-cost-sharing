import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
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
    CommonModule,
    MatIconButton,
    MatSuffix,
    MatIcon,
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
    AsyncPipe,
    CurrencyPipe,
  ],
})
export class MemorizedComponent implements OnInit {
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

  user: WritableSignal<User> = this.userService.user;
  categories: WritableSignal<Category[]> = this.categoryService.allCategories;
  currentGroup: WritableSignal<Group> = this.groupService.currentGroup;
  currentMember: WritableSignal<Member> = this.memberService.currentGroupMember;
  members: WritableSignal<Member[]> = this.memberService.activeGroupMembers;
  expenses: WritableSignal<Expense[]> = this.expenseService.memorizedExpenses;
  filteredExpenses = computed(() => {
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

  selectedMemberId = signal<string>('');
  selectedCategoryId = signal<string>('');

  selectedMemberIdValue: string = '';
  selectedCategoryIdValue: string = '';

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

  ngOnInit(): void {
    if (this.currentGroup() == null) {
      this.router.navigateByUrl('/groups');
    }
  }

  selectedMemberChanged(): void {
    this.selectedMemberId.set(this.selectedMemberIdValue);
  }

  clearSelectedMember(): void {
    this.selectedMemberId.set('');
    this.selectedMemberIdValue = '';
  }

  selectedCategoryChagned(): void {
    this.selectedCategoryId.set(this.selectedCategoryIdValue);
  }

  clearSelectedCategory(): void {
    this.selectedCategoryId.set('');
    this.selectedCategoryIdValue = '';
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
