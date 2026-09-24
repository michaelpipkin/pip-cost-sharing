import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DateShortcutKeysDirective } from '@directives/date-plus-minus.directive';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { AmountDue } from '@models/amount-due';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import {
  GUIDED_TOUR_DIALOG_CONFIG,
  GuidedTourDialogs,
} from '@services/guided-tour-dialogs';
import { GuidedTourService } from '@services/guided-tour.service';
import { HistoryService } from '@services/history.service';
import { LocaleService } from '@services/locale.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SplitStore } from '@store/split.store';
import { doc, DocumentReference, getFirestore } from 'firebase/firestore';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '../../help/help-dialog/help-dialog.component';
import { toIsoFormat } from '@utils/date-utils';
import { PaymentDialogComponent } from '../payment-dialog/payment-dialog.component';
import { SettleGroupDialogComponent } from '../settle-group-dialog/settle-group-dialog.component';
import { buildSummaryTourSteps } from './summary.tour';

/** Sample balances the guided tour shows when nothing is owed. */
interface SummaryTourSample {
  splits: Split[];
  /** Sample members the splits need beyond the group's real members. */
  members: Member[];
  /** A sample category, only when the group has none. */
  categories: Category[];
}

@Component({
  selector: 'app-summary',
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
    MatTableModule,
    MatCardModule,
    CurrencyPipe,
    DocRefCompareDirective,
    DateShortcutKeysDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryComponent {
  protected readonly router = inject(Router);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly splitService = inject(SplitService);
  protected readonly splitStore = inject(SplitStore);
  protected readonly historyService = inject(HistoryService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly localeService = inject(LocaleService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly appCheckErrorHandler = inject(AppCheckErrorHandlerService);
  protected readonly guidedTour = inject(GuidedTourService);
  protected readonly fs = inject(getFirestore);

  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  members: Signal<Member[]> = this.memberStore.groupMembers;
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  currentMember: Signal<Member | null> = this.memberStore.currentMember;
  splits: Signal<Split[]> = this.splitStore.unpaidSplits;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;

  // Sample balances the guided tour shows when nothing is owed. Held here,
  // never in the stores (so a listener can't replace them), and cleared when
  // the tour ends.
  protected readonly tourSample = signal<SummaryTourSample | null>(null);
  protected readonly displayedSplits = computed(
    () => this.tourSample()?.splits ?? this.splits()
  );
  protected readonly displayedMembers = computed(() => [
    ...this.members(),
    ...(this.tourSample()?.members ?? []),
  ]);
  protected readonly displayedActiveMembers = computed(() => [
    ...this.activeMembers(),
    ...(this.tourSample()?.members ?? []),
  ]);
  protected readonly displayedCategories = computed(() => [
    ...this.categories(),
    ...(this.tourSample()?.categories ?? []),
  ]);
  readonly #tourDialogs = new GuidedTourDialogs<'settle-group'>();

  owedToMemberRef = signal<DocumentReference<Member>>(
    null as unknown as DocumentReference<Member>
  );
  owedByMemberRef = signal<DocumentReference<Member>>(
    null as unknown as DocumentReference<Member>
  );

  selectedMember = model<DocumentReference<Member> | null>(
    this.currentMember()?.ref ?? null
  );
  startDate = model<Date | null>(null);
  endDate = model<Date | null>(null);

  smallScreen = signal<boolean>(false);
  summaryView = signal<'individual' | 'settlement'>('individual');

  filteredSplits = computed(() => {
    let startDate: Date;
    let endDate: Date;
    if (this.startDate() == null) {
      startDate = new Date('1/1/1900');
    } else {
      startDate = new Date(this.startDate()!);
    }
    if (this.endDate() == null) {
      const today = new Date();
      endDate = new Date(today.setFullYear(today.getFullYear() + 100));
    } else {
      endDate = new Date(this.endDate()!);
      endDate = new Date(endDate.setDate(endDate.getDate() + 1));
    }
    return this.displayedSplits().filter((split: Split) => {
      return split.date >= startDate && split.date < endDate;
    });
  });

  summaryData = computed(() => {
    const selectedMember = this.selectedMember();
    const splits = this.filteredSplits();
    const summaryData: AmountDue[] = [];
    if (!selectedMember || splits.length === 0) return summaryData;
    const selected = this.#memberByRef(selectedMember);
    const memberSplits = splits.filter(
      (s) =>
        s.owedByMemberRef.eq(selectedMember) ||
        s.paidByMemberRef.eq(selectedMember)
    );
    this.displayedMembers()
      .filter((m) => !m.ref!.eq(selectedMember)) // NOSONAR
      .forEach((member) => {
        const owedToSelected = this.localeService.roundToCurrency(
          +memberSplits
            .filter((m) => m.owedByMemberRef.eq(member.ref!)) // NOSONAR
            .reduce((total, split) => total + split.allocatedAmount, 0)
        );
        const owedBySelected = this.localeService.roundToCurrency(
          +memberSplits
            .filter((m) => m.paidByMemberRef.eq(member.ref!)) // NOSONAR
            .reduce((total, split) => total + split.allocatedAmount, 0)
        );
        if (owedToSelected > owedBySelected) {
          summaryData.push(
            new AmountDue({
              owedByMemberRef: member.ref!,
              owedByMember: member,
              owedToMemberRef: selectedMember,
              owedToMember: selected,
              amount: owedToSelected - owedBySelected,
            })
          );
        } else if (owedBySelected > owedToSelected) {
          summaryData.push(
            new AmountDue({
              owedToMemberRef: member.ref!,
              owedToMember: member,
              owedByMemberRef: selectedMember,
              owedByMember: selected,
              amount: owedBySelected - owedToSelected,
            })
          );
        }
      });
    return summaryData;
  });

  summaryMemberCount = computed(() => {
    const memberPaths = new Set<string>();
    this.leastTransfers().forEach((transfer) => {
      memberPaths.add(transfer.owedByMemberRef.path);
      memberPaths.add(transfer.owedToMemberRef.path);
    });
    return memberPaths.size;
  });

  // On small screens both tables can't comfortably share the viewport, so
  // only one section shows at a time, switched via summaryView().
  showIndividualSection = computed(
    () => !this.smallScreen() || this.summaryView() === 'individual'
  );
  showSettlementSection = computed(
    () => !this.smallScreen() || this.summaryView() === 'settlement'
  );

  detailData = computed(() => {
    const owedToMemberRef = this.owedToMemberRef();
    const owedByMemberRef = this.owedByMemberRef();
    const detailData: AmountDue[] = [];
    if (!owedToMemberRef || !owedByMemberRef) return detailData;
    const memberSplits = this.filteredSplits().filter(
      (s) =>
        (s.owedByMemberRef.eq(owedToMemberRef) ||
          s.paidByMemberRef.eq(owedToMemberRef)) &&
        (s.owedByMemberRef.eq(owedByMemberRef) ||
          s.paidByMemberRef.eq(owedByMemberRef))
    );
    const owedByMember = this.#memberByRef(owedByMemberRef);
    const owedToMember = this.#memberByRef(owedToMemberRef);
    this.displayedCategories().forEach((category) => {
      const categorySplits = memberSplits.filter(
        (split) => split.categoryRef.eq(category.ref!) // NOSONAR
      );
      if (categorySplits.length === 0) return;
      const amountFor = (payerRef: DocumentReference<Member>) =>
        categorySplits
          .filter((s) => s.paidByMemberRef.eq(payerRef))
          .reduce((total, split) => total + split.allocatedAmount, 0);
      detailData.push(
        new AmountDue({
          categoryRef: category.ref!,
          category,
          owedByMemberRef,
          owedByMember,
          owedToMemberRef,
          owedToMember,
          amount: amountFor(owedToMemberRef) - amountFor(owedByMemberRef),
        })
      );
    });
    return detailData;
  });

  expandedDetail = model<AmountDue | null>(null);

  leastTransfers = computed(() => {
    const splits = this.filteredSplits();
    if (splits.length === 0) return [];

    // Accumulate net balance per member, keyed by document path
    const balances = new Map<string, number>();
    const refByPath = new Map<string, DocumentReference<Member>>();

    for (const split of splits) {
      const creditorPath = split.paidByMemberRef.path;
      const debtorPath = split.owedByMemberRef.path;
      refByPath.set(creditorPath, split.paidByMemberRef);
      refByPath.set(debtorPath, split.owedByMemberRef);
      balances.set(
        creditorPath,
        (balances.get(creditorPath) ?? 0) + split.allocatedAmount
      );
      balances.set(
        debtorPath,
        (balances.get(debtorPath) ?? 0) - split.allocatedAmount
      );
    }

    // Separate into creditors (positive) and debtors (negative)
    const creditors: { path: string; balance: number }[] = [];
    const debtors: { path: string; balance: number }[] = [];

    balances.forEach((balance, path) => {
      const rounded = this.localeService.roundToCurrency(balance);
      if (rounded > 0) creditors.push({ path, balance: rounded });
      else if (rounded < 0) debtors.push({ path, balance: rounded });
    });

    // Sort by absolute value descending
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => a.balance - b.balance); // most negative first

    // Greedy matching: pair largest debtor with largest creditor
    const transfers: AmountDue[] = [];
    let ci = 0;
    let di = 0;

    while (ci < creditors.length && di < debtors.length) {
      const creditor = creditors[ci]!;
      const debtor = debtors[di]!;
      const amount = this.localeService.roundToCurrency(
        Math.min(creditor.balance, -debtor.balance)
      );

      const owedByRef = refByPath.get(debtor.path)!;
      const owedToRef = refByPath.get(creditor.path)!;

      transfers.push(
        new AmountDue({
          owedByMemberRef: owedByRef,
          owedByMember: this.#memberByRef(owedByRef),
          owedToMemberRef: owedToRef,
          owedToMember: this.#memberByRef(owedToRef),
          amount,
        })
      );

      creditor.balance = this.localeService.roundToCurrency(
        creditor.balance - amount
      );
      debtor.balance = this.localeService.roundToCurrency(
        debtor.balance + amount
      );

      if (creditor.balance === 0) ci++;
      if (debtor.balance === 0) di++;
    }

    return transfers;
  });

  protected readonly hasEmailableRecipients = computed(() =>
    this.leastTransfers().some((t) => !!t.owedByMember?.userRef)
  );

  /** Finds a member, including the tour's sample members. */
  #memberByRef(ref: DocumentReference<Member>): Member | undefined {
    return this.displayedMembers().find((m) => m.ref?.eq(ref));
  }

  isOwedBySelf(amountDue: AmountDue): boolean {
    const currentMemberRef = this.currentMember()?.ref;
    return !!currentMemberRef && amountDue.owedByMemberRef.eq(currentMemberRef);
  }

  constructor() {
    // Leaving the page mid-tour ends it (and clears what it changed)
    inject(DestroyRef).onDestroy(() => this.guidedTour.stop('closed'));

    effect(() => {
      this.selectedMember.set(this.currentMember()?.ref ?? null);
    });
    effect(() => {
      if (this.splitStore.loaded()) {
        this.loading.loadingOff();
      } else {
        this.loading.loadingOn();
      }
    });
    // Below this size, the two summary tables can't both show a useful
    // number of rows at once, so they're shown one at a time via a toggle.
    this.breakpointObserver
      .observe(['(max-width: 600px)', '(max-height: 700px)'])
      .subscribe((result) => {
        this.smallScreen.set(result.matches);
      });
  }

  onExpandClick(amountDue: AmountDue): void {
    this.expandedDetail.update((d) => (d === amountDue ? null : amountDue));
    this.owedByMemberRef.set(amountDue.owedByMemberRef);
    this.owedToMemberRef.set(amountDue.owedToMemberRef);
  }

  resetDetail(): void {
    this.expandedDetail.set(null);
  }

  async payExpenses(
    owedToMemberRef: DocumentReference<Member>,
    owedByMemberRef: DocumentReference<Member>
  ): Promise<void> {
    this.owedToMemberRef.set(owedToMemberRef);
    this.owedByMemberRef.set(owedByMemberRef);
    const splitsToPay = this.filteredSplits().filter(
      (s) =>
        (s.owedByMemberRef.eq(owedByMemberRef) &&
          s.paidByMemberRef.eq(owedToMemberRef)) ||
        (s.owedByMemberRef.eq(owedToMemberRef) &&
          s.paidByMemberRef.eq(owedByMemberRef))
    );
    let paymentMethods = {};
    this.loading.loadingOn();
    try {
      paymentMethods =
        await this.userService.getPaymentMethods(owedToMemberRef);
    } finally {
      this.loading.loadingOff();
    }
    const dialogConfig: MatDialogConfig = {
      data: {
        payToMemberName: this.#memberByRef(owedToMemberRef)?.displayName,
        ...paymentMethods,
      },
    };
    const dialogRef = this.dialog.open(PaymentDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          let history = {
            paidByMemberRef: owedByMemberRef,
            paidToMemberRef: owedToMemberRef,
            date: toIsoFormat(new Date()),
            totalPaid: this.localeService.roundToCurrency(
              +splitsToPay.reduce(
                (total, s) =>
                  s.paidByMemberRef.eq(owedToMemberRef)
                    ? total + +s.allocatedAmount
                    : total - +s.allocatedAmount,
                0
              )
            ),
            splitsPaid: splitsToPay.map((s) => s.ref!),
          };
          await this.splitService.paySplitsBetweenMembers(
            this.currentGroup()!.id,
            splitsToPay,
            history
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Expenses have been marked paid' },
          });
        } catch (error) {
          this.analytics.logError(
            'Summary Component',
            'mark_expenses_paid',
            'Failed to mark expenses paid',
            error instanceof Error ? error.message : 'Unknown error'
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: {
              message: 'Something went wrong - could not mark expenses paid',
            },
          });
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'summary' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  settleGroupAction(
    forTour = false
  ): MatDialogRef<SettleGroupDialogComponent> | null {
    const transfers = this.leastTransfers();
    if (transfers.length === 0) return null;
    const dialogConfig: MatDialogConfig = {
      ...(forTour ? GUIDED_TOUR_DIALOG_CONFIG : {}),
      data: {
        transfers,
        settlementText: this.generateSettlementText(transfers),
      },
    };
    const dialogRef = this.dialog.open(
      SettleGroupDialogComponent,
      dialogConfig
    );
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          await this.splitService.settleGroup(
            this.currentGroup()!.id,
            this.filteredSplits(),
            transfers
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Group settlement completed successfully' },
          });
        } catch (error) {
          this.analytics.logError(
            'Summary Component',
            'settle_group',
            'Failed to settle group',
            error instanceof Error ? error.message : 'Unknown error'
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Something went wrong - could not settle group' },
          });
        } finally {
          this.loading.loadingOff();
        }
      }
    });
    return dialogRef;
  }

  /**
   * Starts the guided tour. With nothing owed, sample balances between you
   * and two other members are shown; the tour expands a row, switches the
   * small-screen view, and opens the Settle Group confirmation, and puts
   * everything back when it ends.
   */
  startTour(): void {
    const previous = {
      selectedMember: this.selectedMember(),
      expandedDetail: this.expandedDetail(),
      owedToMemberRef: this.owedToMemberRef(),
      owedByMemberRef: this.owedByMemberRef(),
      summaryView: this.summaryView(),
    };
    const me = this.currentMember();
    if (this.splits().length === 0 && me?.ref) {
      this.tourSample.set(this.#tourSampleData(me));
      this.selectedMember.set(me.ref);
    }
    this.guidedTour.start({
      id: 'summary',
      steps: buildSummaryTourSteps({
        usingSample: () => this.tourSample() !== null,
        hasSettlement: () => this.summaryMemberCount() > 2,
        showView: (view) => this.summaryView.set(view),
        expandFirst: () => {
          const first = this.summaryData()[0];
          if (first && this.expandedDetail() !== first) {
            this.onExpandClick(first);
          }
        },
        collapse: () => this.resetDetail(),
        openSettleGroup: () =>
          this.#tourDialogs.open('settle-group', () =>
            this.settleGroupAction(true)!
          ),
        closeDialogs: () => this.#tourDialogs.close(),
      }),
      onEnd: () => {
        this.#tourDialogs.close();
        this.tourSample.set(null);
        this.selectedMember.set(previous.selectedMember);
        this.owedToMemberRef.set(previous.owedToMemberRef);
        this.owedByMemberRef.set(previous.owedByMemberRef);
        this.expandedDetail.set(previous.expandedDetail);
        this.summaryView.set(previous.summaryView);
      },
      fullHelp: () => this.showHelp(),
    });
  }

  #tourSampleData(me: Member): SummaryTourSample {
    // Use the group's real members first, then sample people as needed, so
    // there are always three people and the settlement section shows
    const others = this.activeMembers()
      .filter((m) => !m.ref!.eq(me.ref!)) // NOSONAR
      .slice(0, 2);
    const sampleMembers = [
      ['tour-sample-alex', 'Alex'],
      ['tour-sample-jordan', 'Jordan'],
    ]
      .slice(0, 2 - others.length)
      .map(
        ([id, displayName]) =>
          new Member({
            id,
            displayName,
            active: true,
            userRef: null,
            // Built locally; the tour never reads or writes it
            ref: doc(this.fs, `members/${id}`) as DocumentReference<Member>,
          })
      );
    const [a, b] = [...others, ...sampleMembers] as [Member, Member];

    const sampleCategories =
      this.categories().length > 0
        ? []
        : [
            new Category({
              id: 'tour-sample-category',
              name: 'Default',
              ref: doc(
                this.fs,
                'categories/tour-sample-category'
              ) as DocumentReference<Category>,
            }),
          ];
    const categories = [...this.categories(), ...sampleCategories];
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

    const split = (
      id: string,
      payer: Member,
      owedBy: Member,
      amount: number,
      days: number,
      categoryIndex: number
    ) =>
      new Split({
        id: `tour-sample-${id}`,
        date: daysAgo(days),
        categoryRef: categories[categoryIndex % categories.length]!.ref!,
        paidByMemberRef: payer.ref!,
        owedByMemberRef: owedBy.ref!,
        allocatedAmount: amount,
        paid: false,
      });
    // Three expenses split three ways, each paid by someone different. You
    // net +25, so the settlement (two payments to you) differs from the
    // individual rows, which shows what the fewest-transfers table is for.
    return {
      members: sampleMembers,
      categories: sampleCategories,
      splits: [
        split('groceries-a', me, a, 30, 20, 0),
        split('groceries-b', me, b, 30, 20, 0),
        split('dinner-me', a, me, 20, 12, 1),
        split('dinner-b', a, b, 20, 12, 1),
        split('gas-me', b, me, 15, 5, 2),
        split('gas-a', b, a, 15, 5, 2),
      ],
    };
  }

  async copySummaryToClipboard(amountDue: AmountDue): Promise<void> {
    const summaryText = this.generateSummaryText(amountDue);
    try {
      await navigator.clipboard.writeText(summaryText);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Summary copied to clipboard' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Summary Component',
          'copy_summary_to_clipboard',
          'Failed to copy summary to clipboard',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Failed to copy summary' },
        });
      }
    }
  }

  private generateSummaryText(amountDue: AmountDue): string {
    const owedTo = amountDue.owedToMember?.displayName ?? 'Unknown';
    const owedBy = amountDue.owedByMember?.displayName ?? 'Unknown';

    let summaryText = `Expenses Summary\n`;
    summaryText += `${owedBy} owes ${owedTo} ${this.formatCurrency(amountDue.amount)}\n\n`;

    // Add category breakdown
    const categoryDetails = this.detailData();
    if (categoryDetails.length > 0) {
      summaryText += `Breakdown by Category:\n`;

      // Calculate the maximum line length for alignment
      let maxLineLength = 0;
      const categoryLines: { name: string; amount: string }[] = [];

      categoryDetails.forEach((detail) => {
        const categoryName = detail.category?.name ?? 'Unknown';
        const formattedAmount = this.formatCurrency(detail.amount);
        const lineLength = categoryName.length + 2 + formattedAmount.length; // +2 for ": "
        maxLineLength = Math.max(maxLineLength, lineLength);
        categoryLines.push({
          name: categoryName,
          amount: formattedAmount,
        });
      });

      summaryText += `${'='.repeat(maxLineLength + 1)}\n`;

      // Add padded category lines
      categoryLines.forEach((line) => {
        const spacesNeeded =
          maxLineLength - line.name.length - line.amount.length;
        const padding = ' '.repeat(spacesNeeded);
        summaryText += `${line.name}:${padding}${line.amount}\n`;
      });
    }

    return summaryText.trim();
  }

  async copySettlementToClipboard(): Promise<void> {
    const settlementText = this.generateSettlementText(this.leastTransfers());
    try {
      await navigator.clipboard.writeText(settlementText);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Settlement copied to clipboard' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Summary Component',
          'copy_settlement_to_clipboard',
          'Failed to copy settlement to clipboard',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Failed to copy settlement' },
        });
      }
    }
  }

  private generateSettlementText(transfers: AmountDue[]): string {
    let text = 'Group Settlement Transfers\n\n';
    transfers.forEach((transfer) => {
      const owedBy = transfer.owedByMember?.displayName ?? 'Unknown';
      const owedTo = transfer.owedToMember?.displayName ?? 'Unknown';
      text += `${owedBy} pays ${owedTo}: ${this.formatCurrency(transfer.amount)}\n`;
    });
    return text.trim();
  }

  async requestPayment(amountDue: AmountDue): Promise<void> {
    const owedByMember = amountDue.owedByMember!;
    try {
      this.loading.loadingOn();
      const result = await this.userService.sendPaymentRequestEmail(
        owedByMember,
        amountDue.owedToMember!,
        this.currentGroup()!.name,
        this.formatCurrency(amountDue.amount)
      );
      let message: string;
      if (result === 'not_registered') {
        message = `${owedByMember.displayName} is not a registered user and cannot receive emails`;
      } else if (result === 'opted_out') {
        message = `${owedByMember.displayName} has opted out of email notifications`;
      } else {
        message = 'Payment request email sent successfully';
      }
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
    } catch (error) {
      this.analytics.logError(
        'Summary Component',
        'request_payment',
        'Failed to send payment request',
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.appCheckErrorHandler.handle(
        error,
        'Something went wrong - could not send payment request'
      );
    } finally {
      this.loading.loadingOff();
    }
  }

  async requestAllPayments(): Promise<void> {
    const transfers = this.leastTransfers().map((t) => ({
      owedByMember: t.owedByMember!,
      owedToMember: t.owedToMember!,
      formattedAmount: this.formatCurrency(t.amount),
    }));
    try {
      this.loading.loadingOn();
      const { sent } = await this.userService.sendGroupPaymentRequestEmails(
        transfers,
        this.currentGroup()!.name
      );
      const message =
        sent === 0
          ? 'No eligible members to request payment from'
          : `Payment request(s) sent to ${sent} member(s)`;
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
    } catch (error) {
      this.analytics.logError(
        'Summary Component',
        'request_all_payments',
        'Failed to send group payment requests',
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.appCheckErrorHandler.handle(
        error,
        'Something went wrong - could not send payment requests'
      );
    } finally {
      this.loading.loadingOff();
    }
  }

  // Helper method to format currency
  private formatCurrency(amount: number): string {
    return this.localeService.formatCurrency(amount);
  }
}
