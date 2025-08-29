import { BreakpointObserver } from '@angular/cdk/layout';
import { CurrencyPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  model,
  OnInit,
  signal,
  Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized, SerializableMemorized } from '@models/memorized';
import { SplitService } from '@services/split.service';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';

@Component({
  selector: 'app-memorized',
  templateUrl: './memorized.component.html',
  styleUrl: './memorized.component.scss',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatTableModule,
    MatInputModule,
    CurrencyPipe,
    RouterLink,
  ],
})
export class MemorizedComponent implements OnInit {
  protected readonly router = inject(Router);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly memorizedStore = inject(MemorizedStore);
  protected readonly splitService = inject(SplitService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly breakpointObserver = inject(BreakpointObserver);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  currentMember: Signal<Member> = this.memberStore.currentMember;
  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  memorizeds: Signal<Memorized[]> = this.memorizedStore.memorizedExpenses;

  searchText = model<string>('');
  searchFocused = model<boolean>(false);

  filteredMemorizeds = computed<Memorized[]>(
    (searchText: string = this.searchText()) => {
      var filteredMemorized = this.memorizeds().filter(
        (memorized: Memorized) => {
          return (
            !searchText ||
            memorized.description
              .toLowerCase()
              .includes(searchText.toLowerCase()) ||
            this.members()
              .find((m) => m.ref.eq(memorized.paidByMemberRef))
              ?.displayName.toLowerCase()
              .includes(searchText.toLowerCase()) ||
            this.categories()
              .find((c) => c.ref.eq(memorized.categoryRef))
              ?.name.toLowerCase()
              .includes(searchText.toLowerCase())
          );
        }
      );
      return filteredMemorized;
    }
  );
  expandedExpense = model<Memorized | null>(null);

  columnsToDisplay = signal<string[]>([]);

  constructor() {
    effect(() => {
      if (!this.memorizedStore.loaded()) {
        this.loading.loadingOn();
      } else {
        this.loading.loadingOff();
      }
    });
  }

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

  onSearchFocus() {
    this.searchFocused.set(true);
  }

  onSearchBlur() {
    if (!this.searchText()) {
      this.searchFocused.set(false);
    }
  }

  onExpandClick(expense: Memorized) {
    this.expandedExpense.update((e) => (e === expense ? null : expense));
  }

  getMemberName(memberId: string): string {
    const member = this.members().find((m: Member) => m.id === memberId);
    return member?.displayName ?? '';
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories().find((c) => c.id === categoryId);
    return category?.name ?? '';
  }

  onRowClick(memorized: Memorized): void {
    this.loading.loadingOn();
    this.router.navigate(['/memorized', memorized.id]);
  }

  addExpense(expense: Memorized): void {
    // Create a serializable version of the expense by converting DocumentReferences to IDs
    const serializableExpense: SerializableMemorized = {
      id: expense.id,
      description: expense.description,
      categoryId: expense.categoryRef.id,
      paidByMemberId: expense.paidByMemberRef.id,
      sharedAmount: expense.sharedAmount,
      allocatedAmount: expense.allocatedAmount,
      totalAmount: expense.totalAmount,
      splitByPercentage: expense.splitByPercentage,
      splits: expense.splits.map((split) => ({
        assignedAmount: split.assignedAmount,
        percentage: split.percentage,
        allocatedAmount: split.allocatedAmount,
        owedByMemberId: split.owedByMemberRef?.id,
      })),
    };

    this.router.navigate(['/expenses/add'], {
      state: { expense: serializableExpense },
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'memorized' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
