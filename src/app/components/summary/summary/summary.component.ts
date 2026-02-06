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
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AmountDue } from '@models/amount-due';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { DemoService } from '@services/demo.service';
import { HistoryService } from '@services/history.service';
import { LocaleService } from '@services/locale.service';
import { SplitService } from '@services/split.service';
import { TourService } from '@services/tour.service';
import { UserService } from '@services/user.service';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SplitStore } from '@store/split.store';
import { AnalyticsService } from '@services/analytics.service';
import { UserStore } from '@store/user.store';
import { DocumentReference } from 'firebase/firestore';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '../../help/help-dialog/help-dialog.component';
import { PaymentDialogComponent } from '../payment-dialog/payment-dialog.component';

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
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatTableModule,
    CurrencyPipe,
    DocRefCompareDirective,
    DateShortcutKeysDirective,
  ],
})
export class SummaryComponent implements AfterViewInit {
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly splitService = inject(SplitService);
  protected readonly splitStore = inject(SplitStore);
  protected readonly historyService = inject(HistoryService);
  protected readonly tourService = inject(TourService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly demoService = inject(DemoService);
  protected readonly localeService = inject(LocaleService);

  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  members: Signal<Member[]> = this.memberStore.groupMembers;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  currentMember: Signal<Member> = this.memberStore.currentMember;
  splits: Signal<Split[]> = this.splitStore.unpaidSplits;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;

  owedToMemberRef = signal<DocumentReference<Member>>(null);
  owedByMemberRef = signal<DocumentReference<Member>>(null);

  selectedMember = model<DocumentReference<Member>>(
    this.currentMember()?.ref ?? null
  );
  startDate = model<Date | null>(null);
  endDate = model<Date | null>(null);

  filteredSplits = computed(() => {
    var startDate: Date | null;
    var endDate: Date | null;
    if (this.startDate() == null) {
      startDate = new Date('1/1/1900');
    } else {
      startDate = new Date(this.startDate());
    }
    if (this.endDate() == null) {
      const today = new Date();
      endDate = new Date(today.setFullYear(today.getFullYear() + 100));
    } else {
      endDate = new Date(this.endDate());
      endDate = new Date(endDate.setDate(endDate.getDate() + 1));
    }
    return this.splits().filter((split: Split) => {
      return split.date >= startDate && split.date < endDate;
    });
  });

  summaryData = computed(
    (
      selectedMember: DocumentReference<Member> = this.selectedMember(),
      splits: Split[] = this.filteredSplits()
    ) => {
      var summaryData: AmountDue[] = [];
      if (splits.length > 0) {
        var memberSplits = splits.filter((s) => {
          return (
            s.owedByMemberRef.eq(selectedMember) ||
            s.paidByMemberRef.eq(selectedMember)
          );
        });
        this.members()
          .filter((m) => !m.ref.eq(selectedMember))
          .forEach((member) => {
            const owedToSelected = this.localeService.roundToCurrency(
              +memberSplits
                .filter((m) => m.owedByMemberRef.eq(member.ref))
                .reduce((total, split) => (total += split.allocatedAmount), 0)
            );
            const owedBySelected = this.localeService.roundToCurrency(
              +memberSplits
                .filter((m) => m.paidByMemberRef.eq(member.ref))
                .reduce((total, split) => (total += split.allocatedAmount), 0)
            );
            if (owedToSelected > owedBySelected) {
              summaryData.push(
                new AmountDue({
                  owedByMemberRef: member.ref,
                  owedByMember: member,
                  owedToMemberRef: selectedMember,
                  owedToMember: this.memberStore.getMemberByRef(selectedMember),
                  amount: owedToSelected - owedBySelected,
                })
              );
            } else if (owedBySelected > owedToSelected) {
              summaryData.push(
                new AmountDue({
                  owedToMemberRef: member.ref,
                  owedToMember: member,
                  owedByMemberRef: selectedMember,
                  owedByMember: this.memberStore.getMemberByRef(selectedMember),
                  amount: owedBySelected - owedToSelected,
                })
              );
            }
          });
      }
      return summaryData;
    }
  );

  detailData = computed(
    (
      owedToMemberRef: DocumentReference<Member> = this.owedToMemberRef(),
      owedByMemberRef: DocumentReference<Member> = this.owedByMemberRef(),
      splits: Split[] = this.filteredSplits(),
      categories: Category[] = this.categories()
    ) => {
      var detailData: AmountDue[] = [];
      const memberSplits = splits.filter(
        (s) =>
          (s.owedByMemberRef.eq(owedToMemberRef) ||
            s.paidByMemberRef.eq(owedToMemberRef)) &&
          (s.owedByMemberRef.eq(owedByMemberRef) ||
            s.paidByMemberRef.eq(owedByMemberRef))
      );
      categories.forEach((category) => {
        if (
          memberSplits.filter((split: Split) =>
            split.categoryRef.eq(category.ref)
          ).length > 0
        ) {
          const owedToMember1 = memberSplits
            .filter(
              (s: Split) =>
                s.paidByMemberRef.eq(owedToMemberRef) &&
                s.categoryRef.eq(category.ref)
            )
            .reduce((total, split) => (total += split.allocatedAmount), 0);
          const owedToMember2 = memberSplits
            .filter(
              (s: Split) =>
                s.paidByMemberRef.eq(owedByMemberRef) &&
                s.categoryRef.eq(category.ref)
            )
            .reduce((total, split) => (total += split.allocatedAmount), 0);
          detailData.push(
            new AmountDue({
              categoryRef: category.ref,
              category: category,
              owedByMemberRef: owedByMemberRef,
              owedByMember: this.memberStore.getMemberByRef(owedByMemberRef),
              owedToMemberRef: owedToMemberRef,
              owedToMember: this.memberStore.getMemberByRef(owedToMemberRef),
              amount: owedToMember1 - owedToMember2,
            })
          );
        }
      });
      return detailData;
    }
  );

  expandedDetail = model<AmountDue | null>(null);

  constructor() {
    effect(() => {
      this.selectedMember.set(this.currentMember()?.ref ?? null);
    });
    effect(() => {
      if (!this.splitStore.loaded()) {
        this.loading.loadingOn();
      } else {
        this.loading.loadingOff();
      }
    });
  }

  ngAfterViewInit(): void {
    // Check if we should auto-start the summary tour
    this.tourService.checkForContinueTour('summary');
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
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    this.owedToMemberRef.set(owedToMemberRef);
    this.owedByMemberRef.set(owedByMemberRef);
    var splitsToPay: Split[] = [];
    const memberSplits = this.filteredSplits().filter(
      (s) =>
        (s.owedByMemberRef.eq(owedByMemberRef) &&
          s.paidByMemberRef.eq(owedToMemberRef)) ||
        (s.owedByMemberRef.eq(owedToMemberRef) &&
          s.paidByMemberRef.eq(owedByMemberRef))
    );
    splitsToPay = memberSplits;
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
        payToMemberName: this.members().find((m) => m.ref.eq(owedToMemberRef))
          ?.displayName,
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
            date: new Date().toIsoFormat(),
            totalPaid: this.localeService.roundToCurrency(
              +splitsToPay.reduce(
                (total, s) =>
                  s.paidByMemberRef.eq(owedToMemberRef)
                    ? (total += +s.allocatedAmount)
                    : (total -= +s.allocatedAmount),
                0
              )
            ),
            lineItems: [],
          };
          this.detailData().forEach((split) => {
            history.lineItems.push({
              category: split.category.name,
              amount: split.amount,
            });
          });
          await this.splitService.paySplitsBetweenMembers(
            this.currentGroup().id,
            splitsToPay,
            history
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Expenses have been marked paid' },
          });
        } catch (err: any) {
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'mark_expenses_paid',
            message: err.message,
          });
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Something went wrong - could not mark expenses paid' },
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

  startTour(): void {
    // Force start the Summary Tour (ignoring completion state)
    this.tourService.startSummaryTour(true);
  }

  async copySummaryToClipboard(amountDue: AmountDue): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
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
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'copy_summary_to_clipboard',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Failed to copy summary' },
        });
      }
    }
  }

  private generateSummaryText(amountDue: AmountDue): string {
    const owedTo = amountDue.owedToMember.displayName;
    const owedBy = amountDue.owedByMember.displayName;

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
        const formattedAmount = this.formatCurrency(detail.amount);
        const lineLength =
          detail.category.name.length + 2 + formattedAmount.length; // +2 for ": "
        maxLineLength = Math.max(maxLineLength, lineLength);
        categoryLines.push({
          name: detail.category.name,
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

  // Helper method to format currency
  private formatCurrency(amount: number): string {
    return this.localeService.formatCurrency(amount);
  }
}
