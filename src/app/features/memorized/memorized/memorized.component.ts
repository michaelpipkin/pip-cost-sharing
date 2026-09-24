import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  Signal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
import { LoadingService } from '@components/loading/loading.service';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized, SerializableMemorized } from '@models/memorized';
import { GuidedTourService } from '@services/guided-tour.service';
import { SplitService } from '@services/split.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { doc, DocumentReference, getFirestore } from 'firebase/firestore';
import { buildMemorizedTourSteps } from './memorized.tour';

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
    MatCardModule,
    CurrencyPipe,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemorizedComponent {
  protected readonly router = inject(Router);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly memorizedStore = inject(MemorizedStore);
  protected readonly splitService = inject(SplitService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly guidedTour = inject(GuidedTourService);
  protected readonly fs = inject(getFirestore);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  currentMember: Signal<Member | null> = this.memberStore.currentMember;
  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  // Sample templates the guided tour shows a group that hasn't memorized
  // any yet. Held here, never in the store, and cleared when the tour ends.
  protected readonly tourSample = signal<Memorized[] | null>(null);
  memorizeds: Signal<Memorized[]> = computed(
    () => this.tourSample() ?? this.memorizedStore.memorizedExpenses()
  );
  smallScreen = signal<boolean>(false);

  searchText = model<string>('');
  searchFocused = model<boolean>(false);

  filteredMemorizeds = computed<Memorized[]>(() => {
    const searchText = this.searchText().toLowerCase();
    if (!searchText) return this.memorizeds();
    return this.memorizeds().filter(
      (memorized: Memorized) =>
        memorized.description.toLowerCase().includes(searchText) ||
        !!this.members()
          .find((m) => m.ref!.eq(memorized.paidByMemberRef))
          ?.displayName.toLowerCase()
          .includes(searchText) ||
        !!this.categories()
          .find((c) => c.ref!.eq(memorized.categoryRef))
          ?.name.toLowerCase()
          .includes(searchText)
    );
  });
  expandedExpense = model<Memorized | null>(null);

  columnsToDisplay = signal<string[]>([]);

  constructor() {
    // Leaving the page mid-tour ends it (and clears what it changed)
    inject(DestroyRef).onDestroy(() => this.guidedTour.stop('closed'));

    effect(() => {
      if (this.memorizedStore.loaded()) {
        this.loading.loadingOff();
      } else {
        this.loading.loadingOn();
      }
    });

    // Observe breakpoint changes for responsive column display
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
          this.smallScreen.set(true);
        } else {
          this.columnsToDisplay.set([
            'paidBy',
            'description',
            'category',
            'amount',
            'create',
            'expand',
          ]);
          this.smallScreen.set(false);
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

  onRowClick(memorized: Memorized): void {
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
      splitMethod: expense.splitMethod,
      splits: expense.splits.map((split) => ({
        assignedAmount: split.assignedAmount ?? 0,
        percentage: split.percentage ?? 0,
        shares: split.shares ?? 0,
        allocatedAmount: split.allocatedAmount ?? 0,
        owedByMemberId: split.owedByMemberRef?.id,
      })),
    };

    this.router.navigate(['/expenses/add'], {
      state: { expense: serializableExpense },
    });
  }

  /**
   * Starts the guided tour. A group with no memorized expenses sees two
   * sample templates; the tour expands one to show its splits, and puts
   * everything back when it ends.
   */
  startTour(): void {
    const previousExpanded = this.expandedExpense();
    const me = this.currentMember();
    if (this.memorizedStore.memorizedExpenses().length === 0 && me?.ref) {
      this.tourSample.set(this.#tourSampleMemorized(me));
    }
    this.guidedTour.start({
      id: 'memorized',
      steps: buildMemorizedTourSteps({
        usingSample: () => this.tourSample() !== null,
        expandFirst: () =>
          this.expandedExpense.set(this.filteredMemorizeds()[0] ?? null),
        collapse: () => this.expandedExpense.set(null),
      }),
      onEnd: () => {
        this.tourSample.set(null);
        this.expandedExpense.set(previousExpanded);
      },
      fullHelp: () => this.showHelp(),
    });
  }

  #tourSampleMemorized(me: Member): Memorized[] {
    // Split with the group's real members when there are any
    const sampleMember = (id: string, displayName: string) =>
      new Member({
        id,
        displayName,
        ref: doc(this.fs, `members/${id}`) as DocumentReference<Member>,
      });
    const others = this.members().filter((m) => m.id !== me.id);
    const people = [
      me,
      ...(others.length > 0
        ? others.slice(0, 2)
        : [sampleMember('tour-sample-alex', 'Alex')]),
    ];
    const category =
      this.categories()[0] ??
      new Category({ id: 'tour-sample-category', name: 'Default' });
    const categoryRef =
      category.ref ??
      (doc(
        this.fs,
        `categories/${category.id}`
      ) as DocumentReference<Category>);
    const template = (id: string, description: string, totalAmount: number) => {
      const each = Math.round((totalAmount / people.length) * 100) / 100;
      return new Memorized({
        id,
        description,
        totalAmount,
        sharedAmount: totalAmount,
        allocatedAmount: 0,
        splitMethod: 'amount',
        paidByMemberRef: me.ref!,
        paidByMember: me,
        categoryRef,
        category,
        splits: people.map((person, i) => ({
          owedByMemberRef: person.ref!,
          owedByMember: person,
          assignedAmount: 0,
          // The last split takes any rounding remainder
          allocatedAmount:
            i === people.length - 1
              ? Math.round((totalAmount - each * (people.length - 1)) * 100) /
                100
              : each,
        })),
        // Built locally; the tour never reads or writes it
        ref: doc(this.fs, `memorized/${id}`) as DocumentReference<Memorized>,
      });
    };
    return [
      template('tour-sample-rent', 'Rent', 1800),
      template('tour-sample-internet', 'Internet', 79.99),
    ];
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'memorized-expenses' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
