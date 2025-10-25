import { DatePipe } from '@angular/common';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import {
  AfterViewInit,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Group } from '@models/group';
import { History } from '@models/history';
import { Member } from '@models/member';
import { DemoService } from '@services/demo.service';
import { HistoryService } from '@services/history.service';
import { LocaleService } from '@services/locale.service';
import { SortingService } from '@services/sorting.service';
import { TourService } from '@services/tour.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { DateUtils } from '@utils/date-utils.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { DocumentReference } from 'firebase/firestore';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
    MatOptionModule,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatTooltipModule,
    MatIconModule,
    MatSlideToggleModule,
    MatInputModule,
    MatDatepickerModule,
    CurrencyPipe,
    DatePipe,
    DocRefCompareDirective,
  ],
})
export class HistoryComponent implements AfterViewInit {
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly historyService = inject(HistoryService);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly tourService = inject(TourService);
  protected readonly dialog = inject(MatDialog);
  protected readonly sorter = inject(SortingService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly demoService = inject(DemoService);
  protected readonly localeService = inject(LocaleService);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  history: Signal<History[]> = this.historyStore.groupHistory;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  currentMember: Signal<Member> = this.memberStore.currentMember;

  sortField = signal<string>('date');
  sortAsc = signal<boolean>(true);

  selectedMember = model<DocumentReference<Member>>(
    this.currentMember()?.ref ?? null
  );
  startDate = model<Date | null>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ); // 30 days ago
  endDate = model<Date | null>(null);

  filteredHistory = computed<History[]>(
    (selectedMember = this.selectedMember()) => {
      var filteredHistory = this.history().filter((history: History) => {
        return (
          history.paidByMemberRef.eq(selectedMember) ||
          history.paidToMemberRef.eq(selectedMember)
        );
      });
      if (this.startDate() !== undefined && this.startDate() !== null) {
        filteredHistory = filteredHistory.filter((history: History) => {
          return DateUtils.getDateOnly(history.date) >= this.startDate();
        });
      }
      if (this.endDate() !== undefined && this.endDate() !== null) {
        filteredHistory = filteredHistory.filter((history: History) => {
          return DateUtils.getDateOnly(history.date) <= this.endDate();
        });
      }
      if (filteredHistory.length > 0) {
        filteredHistory = this.sorter.sort(
          filteredHistory,
          this.sortField(),
          this.sortAsc()
        );
      }
      return filteredHistory;
    }
  );

  expandedHistory = model<History | null>(null);

  columnsToDisplay = computed<string[]>(() => {
    return this.currentMember()?.groupAdmin
      ? ['date', 'paidTo', 'paidBy', 'amount', 'delete']
      : ['date', 'paidTo', 'paidBy', 'amount'];
  });

  constructor() {
    effect(() => {
      this.selectedMember.set(this.currentMember()?.ref ?? null);
    });
    effect(() => {
      if (!this.historyStore.loaded()) {
        this.loading.loadingOn();
      } else {
        this.loading.loadingOff();
      }
    });
  }

  ngAfterViewInit(): void {
    this.tourService.checkForContinueTour('history');
  }

  onExpandClick(history: History): void {
    this.expandedHistory.update((h) => (h === history ? null : history));
  }

  onDeleteClick(history: History): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Delete',
        target: 'this payment record',
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          await this.historyService.deleteHistory(history.ref);
          this.expandedHistory.set(null);
          this.snackBar.open('Payment record deleted', 'OK');
        } catch (error) {
          if (error instanceof Error) {
            this.snackBar.open(error.message, 'Close');
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'delete_history',
              message: error.message,
            });
          } else {
            this.snackBar.open(
              'Something went wrong - could not delete payment record.',
              'Close'
            );
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  sortHistory(h: { active: string; direction: string }): void {
    this.sortField.set(h.active);
    this.sortAsc.set(h.direction === 'asc');
  }

  resetHistoryTable(): void {
    this.expandedHistory.set(null);
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'history' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    this.tourService.startHistoryTour(true);
  }

  async copyHistoryToClipboard(history: History): Promise<void> {
    const summaryText = this.generateHistoryText(history);
    try {
      await navigator.clipboard.writeText(summaryText);
      this.snackBar.open('Payment history copied to clipboard', 'OK', {
        duration: 2000,
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'copy_history_to_clipboard',
          message: error.message,
        });
      } else {
        this.snackBar.open('Failed to copy payment history', 'OK', {
          duration: 2000,
        });
      }
    }
  }

  getDateOnly(history: History): Date {
    return DateUtils.getDateOnly(history.date);
  }

  private generateHistoryText(history: History): string {
    const paidBy = history.paidByMember.displayName;
    const paidTo = history.paidToMember.displayName;
    const date = DateUtils.getDateOnly(history.date).toLocaleDateString();

    let summaryText = `Payment History\n`;
    summaryText += `${paidBy} paid ${paidTo} ${this.formatCurrency(history.totalPaid)} on ${date}\n\n`;

    // Add category breakdown
    if (history.lineItems && history.lineItems.length > 0) {
      summaryText += `Breakdown by Category:\n`;

      // Calculate the maximum line length for alignment
      let maxLineLength = 0;
      const categoryLines: { name: string; amount: string }[] = [];

      history.lineItems.forEach((lineItem) => {
        const categoryName = lineItem.category;
        const formattedAmount = this.formatCurrency(lineItem.amount);
        const lineLength = categoryName.length + 2 + formattedAmount.length; // +2 for ": "
        maxLineLength = Math.max(maxLineLength, lineLength);
        categoryLines.push({ name: categoryName, amount: formattedAmount });
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

  // Helper method to format currency
  private formatCurrency(amount: number): string {
    return this.localeService.formatCurrency(amount);
  }
}
