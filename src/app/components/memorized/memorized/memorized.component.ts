import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { HelpComponent } from '@components/help/help.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { MemorizedService } from '@services/memorized.service';
import { SplitService } from '@services/split.service';
import { ClearSelectDirective } from '@shared/directives/clear-select.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { AddExpenseComponent } from '../../expenses/add-expense/add-expense.component';
import { AddMemorizedComponent } from '../add-memorized/add-memorized.component';
import { EditMemorizedComponent } from '../edit-memorized/edit-memorized.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
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
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatTableModule,
    CurrencyPipe,
    ClearSelectDirective,
  ],
})
export class MemorizedComponent {
  router = inject(Router);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  memorizedService = inject(MemorizedService);
  splitService = inject(SplitService);
  snackBar = inject(MatSnackBar);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);

  categories: Signal<Category[]> = this.categoryService.groupCategories;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  currentMember: Signal<Member> = this.memberService.currentMember;
  memorizeds: Signal<Memorized[]> = this.memorizedService.memorizedExpenses;
  activeMembers: Signal<Member[]> = this.memberService.activeGroupMembers;

  filteredMemorizeds = computed<Memorized[]>(() => {
    var filteredMemorized = this.memorizeds().filter((memorized: Memorized) => {
      return (
        memorized.paidByMemberId ==
          (this.selectedMemberId() != ''
            ? this.selectedMemberId()
            : memorized.paidByMemberId) &&
        memorized.categoryId ==
          (this.selectedCategoryId() != ''
            ? this.selectedCategoryId()
            : memorized.categoryId)
      );
    });
    return filteredMemorized;
  });

  selectedMemberId = model<string>('');
  selectedCategoryId = model<string>('');
  expandedExpense = model<Memorized | null>(null);

  onExpandClick(expense: Memorized) {
    this.expandedExpense.update((e) => (e === expense ? null : expense));
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'memorized',
        title: 'Memorized Expenses Help',
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

  onRowClick(memorized: Memorized): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        memorized: memorized,
        groupId: this.currentGroup().id,
        member: this.currentMember,
        isGroupAdmin: this.currentMember().groupAdmin,
      },
    };
    const dialogRef = this.dialog.open(EditMemorizedComponent, dialogConfig);
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
      },
    };
    const dialogRef = this.dialog.open(AddMemorizedComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((res) => {
      if (res.success) {
        this.snackBar.open(`Memorized expense ${res.operation}`, 'OK');
      }
    });
  }

  addExpense(expense: Memorized): void {
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
