import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  inject,
  signal,
  Signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Group } from '@models/group';
import { History } from '@models/history';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { HistoryService } from '@services/history.service';
import { LocaleService } from '@services/locale.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { CategoryStore } from '@store/category.store';
import { MemberStore } from '@store/member.store';
import { DocumentReference, getDoc } from 'firebase/firestore';
import { Expense } from '@models/expense';

@Component({
  selector: 'app-history-detail',
  templateUrl: './history-detail.component.html',
  styleUrl: './history-detail.component.scss',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    CurrencyPipe,
    DatePipe,
  ],
})
export class HistoryDetailComponent {
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly historyService = inject(HistoryService);
  protected readonly loading = inject(LoadingService);
  protected readonly dialog = inject(MatDialog);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly demoService = inject(DemoService);
  protected readonly localeService = inject(LocaleService);

  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  currentMember: Signal<Member | null> = this.memberStore.currentMember;

  history = signal<History | null>(null);
  paidSplits = signal<Split[]>([]);

  isAdmin = computed(() => this.currentMember()?.groupAdmin ?? false);
  isGroupSettle = computed(
    () => !this.history()?.splitsPaid || (this.history()?.splitsPaid?.length ?? 0) === 0
  );

  categoryTotals = computed<{ category: string; amount: number }[]>(() => {
    const h = this.history();
    if (!h) return [];
    const totalsMap = new Map<string, number>();
    for (const split of this.paidSplits()) {
      const category = this.categoryStore.getCategoryByRef(split.categoryRef);
      const categoryName = category?.name ?? 'Unknown';
      const isPositive = split.owedByMemberRef.eq(h.paidByMemberRef);
      const contribution = isPositive
        ? split.allocatedAmount
        : -split.allocatedAmount;
      totalsMap.set(
        categoryName,
        (totalsMap.get(categoryName) ?? 0) + contribution
      );
    }
    return [...totalsMap.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => a.category.localeCompare(b.category));
  });

  splitsColumnsToDisplay = computed<string[]>(() =>
    this.isAdmin() ? ['date', 'category', 'amount', 'unpay'] : ['date', 'category', 'amount']
  );

  categoryColumnsToDisplay = ['category', 'amount'];

  constructor() {
    afterNextRender(() => {
      const historyId = this.route.snapshot.paramMap.get('id')!;
      const foundHistory = this.historyStore
        .groupHistory()
        .find((h) => h.id === historyId);
      if (!foundHistory) {
        this.router.navigate(['/analysis/history']);
        return;
      }
      this.history.set(foundHistory);
      if (foundHistory.splitsPaid && foundHistory.splitsPaid.length > 0) {
        this.loadSplits(foundHistory.splitsPaid);
      }
    });
  }

  private async loadSplits(
    splitRefs: DocumentReference<Split>[]
  ): Promise<void> {
    this.loading.loadingOn();
    try {
      const splitDocs = await Promise.all(splitRefs.map((ref) => getDoc(ref)));
      const splits = splitDocs
        .filter((doc) => doc.exists())
        .map((doc) => {
          const data = doc.data() as any;
          return new Split({
            ...data,
            id: doc.id,
            date: data.date.parseDate(),
            category: this.categoryStore.getCategoryByRef(data.categoryRef),
            ref: doc.ref as DocumentReference<Split>,
          });
        });
      this.paidSplits.set(splits);
    } catch (error) {
      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'load_splits',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Failed to load split details' },
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  getSplitDirectedAmount(split: Split): number {
    const h = this.history()!;
    return split.owedByMemberRef.eq(h.paidByMemberRef)
      ? split.allocatedAmount
      : -split.allocatedAmount;
  }

  goBack(): void {
    this.router.navigate(['/analysis/history']);
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'history-detail' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  async onUnpayAll(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const h = this.history()!;
    const splitCount = h.splitsPaid?.length ?? 0;
    const dialogConfig: MatDialogConfig = {
      data: {
        dialogTitle: 'Confirm Unpay',
        confirmationText: `This will mark all ${splitCount} split${splitCount !== 1 ? 's' : ''} in this payment as unpaid and delete this history record. All associated expenses will also be marked as unpaid. This cannot be undone.`,
        confirmButtonText: 'Unpay',
        cancelButtonText: 'Cancel',
      },
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        try {
          await this.historyService.unpayHistory(
            this.currentGroup()!.id,
            h
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Payment marked as unpaid' },
          });
          this.goBack();
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logEvent('error', {
              component: this.constructor.name,
              action: 'unpay_history',
              message: error.message,
            });
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Something went wrong - could not unpay payment' },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  async onUnpaySplit(split: Split): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const h = this.history()!;
    const isLastSplit = (h.splitsPaid?.length ?? 0) === 1;
    const dialogConfig: MatDialogConfig = {
      data: {
        dialogTitle: 'Confirm Unpay Split',
        confirmationText: isLastSplit
          ? 'This will mark this split as unpaid. Since it is the last split in this payment record, the history record will also be deleted.'
          : 'This will mark this split as unpaid and remove it from this payment record. The payment\'s total will be updated accordingly.',
        confirmButtonText: 'Unpay',
        cancelButtonText: 'Cancel',
      },
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        try {
          const isPositiveDirection = split.owedByMemberRef.eq(
            h.paidByMemberRef
          );
          await this.historyService.unpaySingleSplitFromHistory(
            this.currentGroup()!.id,
            split.ref!,
            split.expenseRef as DocumentReference<Expense>,
            h,
            split.allocatedAmount,
            isPositiveDirection
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Split marked as unpaid' },
          });
          if (isLastSplit) {
            this.goBack();
          } else {
            // Refresh the splits list and history record
            const updatedHistory = this.historyStore
              .groupHistory()
              .find((rec) => rec.id === h.id);
            if (updatedHistory) {
              this.history.set(updatedHistory);
              await this.loadSplits(updatedHistory.splitsPaid ?? []);
            } else {
              this.goBack();
            }
          }
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logEvent('error', {
              component: this.constructor.name,
              action: 'unpay_split',
              message: error.message,
            });
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Something went wrong - could not unpay split' },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  async copyToClipboard(): Promise<void> {
    const summaryText = this.generateSummaryText();
    try {
      await navigator.clipboard.writeText(summaryText);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Payment summary copied to clipboard' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'copy_to_clipboard',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Failed to copy payment summary' },
        });
      }
    }
  }

  private generateSummaryText(): string {
    const h = this.history()!;
    const paidBy = h.paidByMember?.displayName ?? 'Unknown';
    const paidTo = h.paidToMember?.displayName ?? 'Unknown';
    const date = h.date.toLocaleDateString();
    let summaryText = `Payment Summary\n`;
    summaryText += `${paidBy} paid ${paidTo} ${this.localeService.formatCurrency(h.totalPaid)} on ${date}\n\n`;

    const totals = this.categoryTotals();
    if (totals.length > 0) {
      summaryText += `Breakdown by Category:\n`;
      let maxLineLength = 0;
      const lines: { name: string; amount: string }[] = [];
      totals.forEach((item) => {
        const formattedAmount = this.localeService.formatCurrency(item.amount);
        const lineLength = item.category.length + 2 + formattedAmount.length;
        maxLineLength = Math.max(maxLineLength, lineLength);
        lines.push({ name: item.category, amount: formattedAmount });
      });
      summaryText += `${'='.repeat(maxLineLength + 1)}\n`;
      lines.forEach((line) => {
        const spacesNeeded =
          maxLineLength - line.name.length - line.amount.length;
        const padding = ' '.repeat(spacesNeeded);
        summaryText += `${line.name}:${padding}${line.amount}\n`;
      });
    }

    return summaryText.trim();
  }
}
