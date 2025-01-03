import { BreakpointObserver } from '@angular/cdk/layout';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
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
import { MemorizedHelpComponent } from '../memorized-help/memorized-help.component';
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
    RouterLink,
  ],
})
export class MemorizedComponent implements OnInit {
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
  breakpointObserver = inject(BreakpointObserver);

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

  columnsToDisplay = signal<string[]>([]);

  ngOnInit(): void {
    this.breakpointObserver
      .observe('(max-width: 1009px)')
      .subscribe((result) => {
        if (result.matches) {
          this.columnsToDisplay.set([
            'paidBy',
            'description-category',
            'amount',
            'create',
            'expand',
          ]);
        } else {
          this.columnsToDisplay.set([
            'paidBy',
            'description',
            'category',
            'amount',
            'create',
            'expand',
          ]);
        }
      });
  }

  onExpandClick(expense: Memorized) {
    this.expandedExpense.update((e) => (e === expense ? null : expense));
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
    this.loading.loadingOn();
    this.router.navigate(['/edit-memorized', memorized.id]);
  }

  addExpense(expense: Memorized): void {
    this.router.navigate(['/add-expense'], {
      state: { expense: expense },
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(MemorizedHelpComponent, dialogConfig);
  }
}
