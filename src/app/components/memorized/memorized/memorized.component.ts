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
import { SplitService } from '@services/split.service';
import { ClearSelectDirective } from '@shared/directives/clear-select.directive';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { DocumentReference } from 'firebase/firestore';
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
  effect,
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
    DocRefCompareDirective,
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

  currentMember: Signal<Member> = this.memberStore.currentMember;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;
  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  memorizeds: Signal<Memorized[]> = this.memorizedStore.memorizedExpenses;

  filteredMemorizeds = computed<Memorized[]>(() => {
    var filteredMemorized = this.memorizeds().filter((memorized: Memorized) => {
      return (
        memorized.paidByMemberRef.path ==
          (!!this.selectedMember()
            ? this.selectedMember().path
            : memorized.paidByMemberRef.path) &&
        memorized.categoryRef.path ==
          (!!this.selectedCategory()
            ? this.selectedCategory().path
            : memorized.categoryRef.path)
      );
    });
    return filteredMemorized;
  });

  selectedMember = model<DocumentReference<Member | null>>(null);
  selectedCategory = model<DocumentReference<Category> | null>(null);
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
    this.router.navigate(['/memorized', memorized.id]);
  }

  addExpense(expense: Memorized): void {
    this.router.navigate(['/expenses/add'], {
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
