import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  minLength,
  required,
  validate,
} from '@angular/forms/signals';
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
import { RouterLink } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { SplitMethodToggleComponent } from '@components/split-method-toggle/split-method-toggle.component';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import { SelectOnFocusDirective } from '@shared/directives/select-on-focus.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import {
  getCurrencyConfig,
  SUPPORTED_CURRENCIES,
} from '@models/currency-config.interface';
import { RentalDetails } from '@models/expense';
import { SplitExpenseForm, SplitItemForm } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { LocaleService } from '@services/locale.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { GroupStore } from '@store/group.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { RentalUtilsService } from '@utils/rental-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { SplitMethod } from '@utils/split-method';
import { withSampleSplitValues } from '@features/expenses/expense-form.tour';
import {
  SplitRentalGridComponent,
  SplitRentalRow,
} from '../split-rental-grid/split-rental-grid.component';
import { buildSplitTourSteps } from './split.tour';

@Component({
  selector: 'app-split',
  imports: [
    FormField,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatOptionModule,
    MatSelectModule,
    MatInputModule,
    MatTooltipModule,
    MatIconModule,
    CurrencyPipe,
    DecimalPipe,
    FormatCurrencyInputDirective,
    SelectOnFocusDirective,
    RouterLink,
    SplitMethodToggleComponent,
    SplitRentalGridComponent,
  ],
  templateUrl: './split.component.html',
  styleUrl: './split.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SplitComponent {
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly rentalUtils = inject(RentalUtilsService);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly guidedTour = inject(GuidedTourService);

  readonly supportedCurrencies = SUPPORTED_CURRENCIES;
  readonly submitted = signal<boolean>(false);
  readonly splitMethod = signal<SplitMethod>('amount');

  // Vacation Rental: an input aid that computes shares from an occupancy
  // grid, then hands them off into the normal shares-editing flow above -
  // same philosophy as the group-expense flow's wizard, just inline since
  // this single-page calculator has no second page to navigate to.
  readonly rentalMode = signal<boolean>(false);
  readonly rentalNightCount = signal<number>(1);
  readonly rentalParticipants = signal<SplitRentalRow[]>([]);

  readonly rentalTotalAmount = computed(() =>
    this.stringUtils.toNumber(this.expenseModel().amount)
  );

  readonly rentalEmptyNights = computed(() =>
    this.rentalUtils.emptyNights<string>(this.#rentalDetails())
  );

  readonly canApplyShares = computed(
    () =>
      this.rentalParticipants().length > 0 &&
      this.rentalEmptyNights().length === 0
  );

  private readonly localCurrencyCode = signal<string>('USD');

  readonly localCurrency = computed(() => {
    const code = this.localCurrencyCode();
    return getCurrencyConfig(code) || getCurrencyConfig('USD')!;
  });

  readonly totalAmountField = viewChild<ElementRef>('totalAmount');
  readonly allocatedAmountField = viewChild<ElementRef>('propAmount');
  readonly memberAmounts = viewChildren<ElementRef>('memberAmount');
  readonly memberPercentages = viewChildren<ElementRef>('memberPercentage');

  protected readonly expenseModel = signal<SplitExpenseForm>({
    currencyCode: 'USD',
    amount: '0.00',
    sharedAmount: 0,
    allocatedAmount: '0.00',
    splits: [],
  });

  protected readonly expenseForm = form(this.expenseModel, (p) => {
    required(p.amount, { message: '*Required' });
    validate(p.amount, ({ value }) =>
      this.stringUtils.toNumber(value()) === 0
        ? { kind: 'zeroAmount', message: 'Cannot be zero' }
        : null
    );
    minLength(p.splits, 1);
    applyEach(p.splits, (item) => {
      required(item.owedBy, { message: '*Required' });
    });
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      // Leaving the page mid-tour ends it (and puts back what it changed)
      this.guidedTour.stop('closed');
      const currentGroup = this.groupStore.currentGroup();
      this.localeService.setGroupCurrency(currentGroup?.currencyCode ?? 'USD');
    });

    this.localeService.setGroupCurrency('USD');
    this.localCurrencyCode.set('USD');
  }

  addSplit(): void {
    this.expenseModel.update((m) => ({
      ...m,
      splits: [
        ...m.splits,
        {
          owedBy: '',
          assignedAmount: this.localeService.getFormattedZero(),
          percentage: 0,
          shares: 0,
          allocatedAmount: 0,
        },
      ],
    }));
    this.recalculateAllocation();
  }

  removeSplit(index: number): void {
    this.expenseModel.update((m) => ({
      ...m,
      splits: m.splits.filter((_, i) => i !== index),
    }));
    this.recalculateAllocation();
  }

  onSplitMethodChange(): void {
    this.recalculateAllocation();
  }

  updateTotalAmount(): void {
    this.recalculateAllocation();
  }

  private recalculateAllocation(): void {
    switch (this.splitMethod()) {
      case 'percentage':
        this.allocateByPercentage();
        break;
      case 'shares':
        this.allocateByShares();
        break;
      default:
        this.allocateSharedAmounts();
    }
  }

  onCurrencyChange(): void {
    const currencyCode = this.expenseModel().currencyCode;
    this.localCurrencyCode.set(currencyCode);
    this.localeService.setGroupCurrency(currencyCode);
    this.resetForm();
  }

  allocateSharedAmounts(): void {
    const model = this.expenseModel();
    const totalAmount = this.stringUtils.toNumber(model.amount);
    const proportionalAmount = this.stringUtils.toNumber(model.allocatedAmount);

    if (model.splits.length === 0) {
      this.expenseModel.update((m) => ({
        ...m,
        sharedAmount: totalAmount - proportionalAmount,
      }));
      return;
    }

    const updatedSplits = model.splits.map((s) => ({ ...s }));
    const calcSplits: {
      owedBy: string;
      assignedAmount: number;
      allocatedAmount: number;
      origIdx: number;
    }[] = [];

    model.splits.forEach((s, i) => {
      const num = this.stringUtils.toNumber(s.assignedAmount);
      if (!s.owedBy && num === 0) {
        updatedSplits[i] = { ...updatedSplits[i]!, allocatedAmount: 0 };
      } else {
        calcSplits.push({
          owedBy: s.owedBy,
          assignedAmount: num,
          allocatedAmount: s.allocatedAmount,
          origIdx: i,
        });
      }
    });

    const splitCount = calcSplits.filter((s) => s.owedBy !== '').length;
    const splitTotal = this.assignedTotal();
    let evenlySharedAmount = model.sharedAmount;
    const totalSharedSplits = this.localeService.roundToCurrency(
      evenlySharedAmount + proportionalAmount + splitTotal
    );

    if (totalAmount !== totalSharedSplits) {
      evenlySharedAmount = this.localeService.roundToCurrency(
        totalAmount - splitTotal - proportionalAmount
      );
    }

    this.distributeAllocations(
      calcSplits,
      totalAmount,
      proportionalAmount,
      evenlySharedAmount,
      splitCount
    );

    const allocatedTotal = this.localeService.roundToCurrency(
      calcSplits.reduce((total, s) => total + s.allocatedAmount, 0)
    );

    if (allocatedTotal !== totalAmount && splitCount > 0) {
      this.adjustAllocationForRounding(calcSplits, totalAmount, allocatedTotal);
    }

    calcSplits
      .filter((s) => s.owedBy !== '')
      .forEach((split) => {
        updatedSplits[split.origIdx] = {
          ...updatedSplits[split.origIdx]!,
          allocatedAmount: split.allocatedAmount,
        };
      });

    this.expenseModel.update((m) => ({
      ...m,
      sharedAmount: evenlySharedAmount,
      splits: updatedSplits,
    }));
  }

  private distributeAllocations(
    splits: {
      owedBy: string;
      assignedAmount: number;
      allocatedAmount: number;
    }[],
    totalAmount: number,
    proportionalAmount: number,
    evenlySharedAmount: number,
    splitCount: number
  ): void {
    const active = splits.filter((s) => s.owedBy !== '');
    active.forEach((split) => {
      split.allocatedAmount =
        splitCount === 0
          ? 0
          : this.localeService.roundToCurrency(evenlySharedAmount / splitCount);
    });
    if (totalAmount === proportionalAmount) return;
    active.forEach((split) => {
      const base = split.assignedAmount + split.allocatedAmount;
      split.allocatedAmount = this.localeService.roundToCurrency(
        base + (base / (totalAmount - proportionalAmount)) * proportionalAmount
      );
    });
  }

  allocateByPercentage(): void {
    const model = this.expenseModel();
    if (model.splits.length === 0) return;

    const result = this.allocationUtils.allocateByPercentage({
      totalAmount: this.stringUtils.toNumber(model.amount),
      splits: model.splits.map((s) => ({
        owedByMemberRef: s.owedBy || null,
        assignedAmount: this.stringUtils.toNumber(s.assignedAmount),
        percentage: s.percentage ?? 0,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });

    const updatedSplits = model.splits.map((s) => ({ ...s }));
    result.splits.forEach((split) => {
      const name = split.owedByMemberRef;
      if (name) {
        const idx = updatedSplits.findIndex((s) => s.owedBy === name);
        if (idx !== -1) {
          updatedSplits[idx] = {
            ...updatedSplits[idx]!,
            percentage: split.percentage,
            allocatedAmount: split.allocatedAmount,
          };
        }
      }
    });

    this.expenseModel.update((m) => ({ ...m, splits: updatedSplits }));
  }

  allocateByShares(): void {
    const model = this.expenseModel();
    if (model.splits.length === 0) return;

    const result = this.allocationUtils.allocateByShares({
      totalAmount: this.stringUtils.toNumber(model.amount),
      splits: model.splits.map((s) => ({
        owedByMemberRef: s.owedBy || null,
        assignedAmount: this.stringUtils.toNumber(s.assignedAmount),
        percentage: s.percentage ?? 0,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });

    const updatedSplits = model.splits.map((s) => ({ ...s }));
    result.splits.forEach((split) => {
      const name = split.owedByMemberRef;
      if (name) {
        const idx = updatedSplits.findIndex((s) => s.owedBy === name);
        if (idx !== -1) {
          updatedSplits[idx] = {
            ...updatedSplits[idx]!,
            percentage: split.percentage,
            allocatedAmount: split.allocatedAmount,
          };
        }
      }
    });

    this.expenseModel.update((m) => ({ ...m, splits: updatedSplits }));
  }

  private adjustAllocationForRounding(
    splits: { allocatedAmount: number }[],
    totalAmount: number,
    allocatedTotal: number
  ): void {
    let diff = this.localeService.roundToCurrency(totalAmount - allocatedTotal);
    const increment = this.localeService.getSmallestIncrement();
    for (let i = 0; diff !== 0;) {
      if (diff > 0) {
        splits[i]!.allocatedAmount += increment;
        diff = this.localeService.roundToCurrency(diff - increment);
      } else {
        splits[i]!.allocatedAmount -= increment;
        diff = this.localeService.roundToCurrency(diff + increment);
      }
      i = (i + 1) % splits.length;
    }
  }

  protected effectivePercentage(index: number): number {
    const splits = this.expenseModel().splits;
    const totalShares = splits.reduce((t, s) => t + (s.shares || 0), 0);
    if (totalShares === 0) return 0;
    return ((splits[index]!.shares || 0) / totalShares) * 100;
  }

  readonly assignedTotal = computed(() =>
    this.localeService.roundToCurrency(
      this.expenseModel().splits.reduce(
        (total, s) =>
          total +
          this.localeService.roundToCurrency(
            this.stringUtils.toNumber(s.assignedAmount)
          ),
        0
      )
    )
  );

  readonly allocatedTotal = computed(() =>
    this.localeService.roundToCurrency(
      this.expenseModel().splits.reduce(
        (total, s) =>
          total + this.localeService.roundToCurrency(s.allocatedAmount),
        0
      )
    )
  );

  readonly expenseFullyAllocated = computed(
    () =>
      this.stringUtils.toNumber(this.expenseModel().amount) ===
      this.allocatedTotal()
  );

  protected splitField(i: number) {
    return this.expenseForm.splits[i]!;
  }

  isLastSplit(index: number): boolean {
    return (
      this.splitMethod() === 'percentage' &&
      index === this.expenseModel().splits.length - 1
    );
  }

  onSubmit(): void {
    this.submitted.set(true);
  }

  generateSummaryText(): string {
    const model = this.expenseModel();
    const totalAmount = this.stringUtils.toNumber(model.amount);
    const allocatedAmount = this.stringUtils.toNumber(model.allocatedAmount);

    let summaryText = `Total: ${this.formatCurrency(totalAmount)}\n`;

    if (this.splitMethod() === 'amount' && model.sharedAmount > 0) {
      summaryText += `Evenly shared amount: ${this.formatCurrency(model.sharedAmount)}\n`;
    }

    if (this.splitMethod() === 'amount' && allocatedAmount > 0) {
      summaryText += `Proportional amount (tax, tip, etc.): ${this.formatCurrency(allocatedAmount)}\n`;
    }

    const splitLines: { text: string; amount: string; isIndented: boolean }[] =
      [];

    model.splits.forEach((split) => {
      if (split.owedBy?.trim()) {
        if (this.splitMethod() === 'percentage') {
          splitLines.push({
            text: `${split.owedBy} (${split.percentage ?? 0}%)`,
            amount: this.formatCurrency(split.allocatedAmount),
            isIndented: false,
          });
        } else if (this.splitMethod() === 'shares') {
          const pct =
            (split.shares ?? 0) > 0
              ? ` (${split.shares} shares, ${split.percentage ?? 0}%)`
              : '';
          splitLines.push({
            text: `${split.owedBy}${pct}`,
            amount: this.formatCurrency(split.allocatedAmount),
            isIndented: false,
          });
        } else {
          const assignedAmount = this.stringUtils.toNumber(
            split.assignedAmount
          );
          const proportionalAmount = this.calculateProportionalAmount(split);
          const sharedPortionAmount = this.calculateSharedPortion(split);

          splitLines.push({
            text: split.owedBy,
            amount: this.formatCurrency(split.allocatedAmount),
            isIndented: false,
          });

          if (assignedAmount > 0) {
            splitLines.push({
              text: '  Personal',
              amount: this.formatCurrency(assignedAmount),
              isIndented: true,
            });
          }
          if (sharedPortionAmount > 0) {
            splitLines.push({
              text: '  Shared',
              amount: this.formatCurrency(sharedPortionAmount),
              isIndented: true,
            });
          }
          if (proportionalAmount > 0) {
            splitLines.push({
              text: '  Proportional',
              amount: this.formatCurrency(proportionalAmount),
              isIndented: true,
            });
          }
        }
      }
    });

    let maxMainLineLength = 0;
    let maxIndentedLineLength = 0;

    splitLines.forEach((line) => {
      const lineLength = line.text.length + 2 + line.amount.length;
      if (line.isIndented) {
        maxIndentedLineLength = Math.max(maxIndentedLineLength, lineLength);
      } else {
        maxMainLineLength = Math.max(maxMainLineLength, lineLength);
      }
    });

    const overallMaxLength = Math.max(maxMainLineLength, maxIndentedLineLength);

    summaryText += `${'='.repeat(overallMaxLength + 1)}\n`;

    splitLines.forEach((line) => {
      const spacesNeeded =
        overallMaxLength - line.text.length - line.amount.length;
      const padding = ' '.repeat(spacesNeeded);
      summaryText += `${line.text}:${padding}${line.amount}\n`;
    });

    return summaryText.trim();
  }

  protected calculateProportionalAmount(split: SplitItemForm): number {
    const model = this.expenseModel();
    const totalAmount = this.stringUtils.toNumber(model.amount);
    const proportionalAmount = this.stringUtils.toNumber(model.allocatedAmount);
    const baseAmount = totalAmount - proportionalAmount;
    const splitCount = model.splits.length || 1;
    const evenlySharedAmount = model.sharedAmount / splitCount;
    const assignedAmount = this.stringUtils.toNumber(split.assignedAmount);
    const memberProportionalAmount =
      ((assignedAmount + evenlySharedAmount) / baseAmount) * proportionalAmount;
    return this.localeService.roundToCurrency(+memberProportionalAmount);
  }

  protected calculateSharedPortion(split: SplitItemForm): number {
    const proportionalAmount = this.calculateProportionalAmount(split);
    const assignedAmount = this.stringUtils.toNumber(split.assignedAmount);
    return this.localeService.roundToCurrency(
      split.allocatedAmount - assignedAmount - proportionalAmount
    );
  }

  private formatCurrency(amount: number): string {
    const curr = this.localCurrency();
    const locale = this.localeService.locale();
    const formatted = Math.abs(amount).toLocaleString(locale, {
      minimumFractionDigits: curr.decimalPlaces,
      maximumFractionDigits: curr.decimalPlaces,
    });

    const symbol =
      curr.symbolPosition === 'prefix'
        ? `${curr.symbol}${formatted}`
        : `${formatted}${curr.symbol}`;

    return amount < 0 ? `-${symbol}` : symbol;
  }

  async copySummaryToClipboard(): Promise<void> {
    const summaryText = this.generateSummaryText();
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
          'Split Component',
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

  resetForm(): void {
    const currentCurrency = this.expenseModel().currencyCode;
    this.expenseForm().reset({
      currencyCode: currentCurrency,
      amount: this.localeService.getFormattedZero(),
      sharedAmount: 0,
      allocatedAmount: this.localeService.getFormattedZero(),
      splits: [],
    });
    this.submitted.set(false);
    this.splitMethod.set('amount');
    this.rentalMode.set(false);
    this.rentalNightCount.set(1);
    this.rentalParticipants.set([]);
  }

  enterRentalMode(): void {
    const existingNames = new Set<string>();
    const seeded: SplitRentalRow[] = [];
    for (const split of this.expenseModel().splits) {
      const name = split.owedBy.trim();
      const normalized = name.toLowerCase();
      if (!name || existingNames.has(normalized)) continue;
      existingNames.add(normalized);
      seeded.push({
        name,
        nights: new Array<boolean>(this.rentalNightCount()).fill(true),
      });
    }
    this.rentalParticipants.set(seeded);
    this.rentalMode.set(true);
  }

  exitRentalMode(): void {
    this.rentalMode.set(false);
  }

  onRentalNightCountInput(value: string): void {
    const parsed = Math.max(1, Math.round(this.stringUtils.toNumber(value)));
    this.rentalNightCount.set(
      Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    );
  }

  applyShares(): void {
    if (!this.canApplyShares()) return;

    const shareResults = this.rentalUtils.computeShares<string>(
      this.#rentalDetails()
    );

    const splits: SplitItemForm[] = shareResults
      .filter((r) => r.memberRef.trim())
      .map((r) => ({
        owedBy: r.memberRef,
        assignedAmount: this.localeService.getFormattedZero(),
        percentage: 0,
        shares: r.shares,
        allocatedAmount: 0,
      }));

    this.expenseModel.update((m) => ({ ...m, splits }));
    this.splitMethod.set('shares');
    this.rentalMode.set(false);
    this.allocateByShares();
  }

  #rentalDetails(): RentalDetails<string> {
    return {
      nightCount: this.rentalNightCount(),
      stays: this.rentalParticipants().map((p) => ({
        memberRef: p.name,
        nights: p.nights
          .map((present, i) => (present ? i : -1))
          .filter((i) => i >= 0),
      })),
    };
  }

  openCalculator(
    event: Event,
    fieldName: 'amount' | 'allocatedAmount',
    index?: number
  ): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      const formatted = this.#formatForInput(result);
      if (index === undefined) {
        this.expenseModel.update((m) => ({ ...m, [fieldName]: formatted }));
        this.updateTotalAmount();
      } else {
        this.expenseModel.update((m) => ({
          ...m,
          splits: m.splits.map((s, i) =>
            i === index ? { ...s, assignedAmount: formatted } : s
          ),
        }));
        this.recalculateAllocation();
      }
    });
  }

  /**
   * Starts the guided tour. With an empty form it fills in a sample bill;
   * along the way it switches split methods, opens the rental grid, and
   * generates the summary, and it puts the page back exactly when it ends.
   */
  startTour(): void {
    const snapshot = {
      model: this.expenseModel(),
      splitMethod: this.splitMethod(),
      submitted: this.submitted(),
      rentalMode: this.rentalMode(),
      rentalNightCount: this.rentalNightCount(),
      rentalParticipants: this.rentalParticipants(),
    };
    const showForm = (method: SplitMethod) => {
      this.submitted.set(false);
      this.rentalMode.set(false);
      this.splitMethod.set(method);
      this.expenseModel.update((m) => ({
        ...m,
        splits: withSampleSplitValues(method, m.splits),
      }));
      this.recalculateAllocation();
    };
    this.guidedTour.start({
      id: 'split',
      steps: buildSplitTourSteps({
        loadSample: () => this.#loadTourSample(),
        showForm,
        showRental: () => {
          showForm('amount');
          if (this.rentalNightCount() === 1) this.rentalNightCount.set(3);
          this.enterRentalMode();
          // The last person skipped the last night, so the grid shows how
          // the nights people missed change their share
          this.rentalParticipants.update((rows) =>
            rows.length > 1
              ? rows.map((row, i) =>
                  i === rows.length - 1
                    ? {
                        ...row,
                        nights: row.nights.map(
                          (n, j) => j < row.nights.length - 1 && n
                        ),
                      }
                    : row
                )
              : rows
          );
        },
        showSummary: () => {
          showForm('amount');
          this.submitted.set(true);
        },
      }),
      onEnd: () => {
        this.expenseModel.set(snapshot.model);
        this.splitMethod.set(snapshot.splitMethod);
        this.submitted.set(snapshot.submitted);
        this.rentalMode.set(snapshot.rentalMode);
        this.rentalNightCount.set(snapshot.rentalNightCount);
        this.rentalParticipants.set(snapshot.rentalParticipants);
      },
      fullHelp: () => this.showHelp(),
    });
  }

  /** A sample dinner for three; only fills in what hasn't been entered. */
  #loadTourSample(): void {
    const model = this.expenseModel();
    const hasAmount = this.stringUtils.toNumber(model.amount) !== 0;
    const people: [string, number][] = [
      ['Alex', 30],
      ['Jordan', 25],
      ['Sam', 0],
    ];
    this.expenseModel.update((m) => ({
      ...m,
      amount: hasAmount ? m.amount : this.#formatForInput(100),
      allocatedAmount: hasAmount ? m.allocatedAmount : this.#formatForInput(15),
      splits:
        m.splits.length > 0
          ? m.splits
          : people.map(([owedBy, personal]) => ({
              owedBy,
              // Personal amounts only make sense with the sample total
              assignedAmount: this.#formatForInput(hasAmount ? 0 : personal),
              percentage: 0,
              shares: 0,
              allocatedAmount: 0,
            })),
    }));
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'split' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  #formatForInput(value: number): string {
    const rounded = this.localeService.roundToCurrency(value);
    const currency = this.localeService.currency();
    return rounded
      .toFixed(currency.decimalPlaces)
      .replace('.', currency.decimalSeparator);
  }
}
