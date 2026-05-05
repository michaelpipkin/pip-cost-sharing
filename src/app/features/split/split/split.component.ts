import { DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
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
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import {
  getCurrencyConfig,
  SUPPORTED_CURRENCIES,
} from '@models/currency-config.interface';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { TourService } from '@services/tour.service';
import { SplitMethodToggleComponent } from '@components/split-method-toggle/split-method-toggle.component';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { GroupStore } from '@store/group.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { SplitMethod } from '@utils/split-method';

@Component({
  selector: 'app-split',
  imports: [
    FormsModule,
    ReactiveFormsModule,
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
    RouterLink,
    SplitMethodToggleComponent,
  ],
  templateUrl: './split.component.html',
  styleUrl: './split.component.scss',
})
export class SplitComponent implements OnDestroy {
  protected readonly fb = inject(FormBuilder);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly demoService = inject(DemoService);
  protected readonly tourService = inject(TourService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly allocationUtils = inject(AllocationUtilsService);

  supportedCurrencies = SUPPORTED_CURRENCIES;
  submitted = signal<boolean>(false);

  splitMethod = signal<SplitMethod>('amount');

  // Local currency state for split component (not tied to group)
  private readonly localCurrencyCode = signal<string>('USD');

  // Computed local currency config
  localCurrency = computed(() => {
    const code = this.localCurrencyCode();
    return getCurrencyConfig(code) || getCurrencyConfig('USD')!;
  });

  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');
  memberPercentages = viewChildren<ElementRef>('memberPercentage');

  expenseForm = this.fb.group({
    currencyCode: ['USD', Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    sharedAmount: [+this.localeService.getFormattedZero(), Validators.required],
    allocatedAmount: [0, Validators.required],
    splits: this.fb.array([], [Validators.required, Validators.minLength(1)]),
  });

  constructor() {
    // Initialize LocaleService with USD for split component
    this.localeService.setGroupCurrency('USD');
    this.localCurrencyCode.set('USD');

    afterNextRender(() => {
      // Ensure LocaleService is synced with split component's currency selection
      // This needs to happen after Angular's change detection in case group effect ran
      if (!this.demoService.isInDemoMode()) {
        this.onCurrencyChange();
      }

      this.totalAmountField()!.nativeElement.value =
        this.localeService.getFormattedZero();
      this.allocatedAmountField()!.nativeElement.value =
        this.localeService.getFormattedZero();
      this.memberAmounts().forEach((elementRef: ElementRef) => {
        elementRef.nativeElement.value = this.localeService.getFormattedZero();
      });
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
    afterNextRender(() => {
      if (this.demoService.isInDemoMode()) {
        this.populateDemoData();
        setTimeout(() => {
          this.tourService.startWelcomeTour();
        }, 500);
      }
    });
  }

  /**
   * Pre-populate the form with demo data for the welcome tour
   */
  private populateDemoData(): void {
    // Set total and proportional amounts
    this.expenseForm.patchValue({
      amount: 65.33,
      allocatedAmount: 17.44,
    });

    // Add three splits with demo member names and amounts
    const demoSplits = [
      { name: 'Alice', amount: 12.55 },
      { name: 'Bob', amount: 13.37 },
      { name: 'Charlie', amount: 14.02 },
    ];

    demoSplits.forEach(() => {
      this.splitsFormArray.push(this.createSplitFormGroup());
    });

    // Wait for the DOM to update, then populate the split values
    setTimeout(() => {
      demoSplits.forEach((split, index) => {
        this.splitsFormArray.at(index).patchValue({
          owedBy: split.name,
          assignedAmount: this.localeService.roundToCurrency(split.amount),
        });
      });

      // Manually update the input field values
      this.totalAmountField()!.nativeElement.value =
        this.localeService.roundToCurrency(65.33);
      this.allocatedAmountField()!.nativeElement.value =
        this.localeService.roundToCurrency(17.44);

      const memberAmountElements = this.memberAmounts();
      if (memberAmountElements.length >= 3) {
        memberAmountElements[0]!.nativeElement.value =
          this.localeService.roundToCurrency(12.55);
        memberAmountElements[1]!.nativeElement.value =
          this.localeService.roundToCurrency(13.37);
        memberAmountElements[2]!.nativeElement.value =
          this.localeService.roundToCurrency(14.02);
      }

      // Trigger calculation to update allocated amounts
      this.allocateSharedAmounts();
    }, 100);
  }

  addSelectFocus(): void {
    this.inputElements().forEach((elementRef: ElementRef<any>) => {
      const input = elementRef.nativeElement as HTMLInputElement;
      input.addEventListener('focus', function () {
        if (this.value === '0.00') {
          this.value = '';
        } else {
          this.select();
        }
      });
    });
  }

  createSplitFormGroup(): FormGroup {
    return this.fb.group({
      owedBy: ['', Validators.required],
      assignedAmount: [
        this.localeService.getFormattedZero(),
        Validators.required,
      ],
      percentage: [0],
      shares: [0],
      allocatedAmount: [0],
    });
  }

  amountValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      return control.value === 0 ? { zeroAmount: true } : null;
    };
  }

  get e() {
    return this.expenseForm.controls;
  }

  get splitsFormArray(): FormArray {
    return this.expenseForm.get('splits') as FormArray;
  }

  addSplit(): void {
    this.splitsFormArray.push(this.createSplitFormGroup());
    // Set the value of the newly created input element to '0.00'
    setTimeout(() => {
      const lastInput = this.memberAmounts().find(
        (i) => i.nativeElement.value === ''
      );
      if (lastInput) {
        lastInput.nativeElement.value = this.localeService.getFormattedZero();
        // Manually trigger the input event to update the mat-label
        const event = new Event('input', { bubbles: true });
        lastInput.nativeElement.dispatchEvent(event);
      }
    });
    this.recalculateAllocation();
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    this.recalculateAllocation();
  }

  onSplitMethodChange(): void {
    this.expenseForm.markAsDirty();
    this.recalculateAllocation();
  }

  updateTotalAmount(): void {
    this.recalculateAllocation();
  }

  private recalculateAllocation(): void {
    switch (this.splitMethod()) {
      case 'percentage': this.allocateByPercentage(); break;
      case 'shares': this.allocateByShares(); break;
      default: this.allocateSharedAmounts();
    }
  }

  onCurrencyChange(): void {
    const currencyCode = this.expenseForm.get('currencyCode')!.value!;
    // Update local state for display
    this.localCurrencyCode.set(currencyCode);
    // Update LocaleService so directives use correct currency
    this.localeService.setGroupCurrency(currencyCode);
    this.resetForm();
  }

  allocateSharedAmounts(): void {
    const val = this.expenseForm.value;
    const totalAmount: number = +val.amount!;
    const proportionalAmount: number = +val.allocatedAmount!;
    if (this.splitsFormArray.length > 0) {
      let splits = [...this.splitsFormArray.value];
      splits = this.filterEmptySplits(splits);
      const splitCount: number = splits.filter((s) => s.owedBy !== '').length;
      const splitTotal: number = this.getAssignedTotal();
      let evenlySharedAmount: number = +val.sharedAmount!;
      const totalSharedSplits: number = this.localeService.roundToCurrency(
        +(evenlySharedAmount + proportionalAmount + splitTotal)
      );
      if (totalAmount != totalSharedSplits) {
        evenlySharedAmount = this.localeService.roundToCurrency(
          +(totalAmount - splitTotal - proportionalAmount)
        );
        this.expenseForm.patchValue({
          sharedAmount: evenlySharedAmount,
        });
      }
      this.distributeAllocations(
        splits,
        totalAmount,
        proportionalAmount,
        evenlySharedAmount,
        splitCount
      );
      const allocatedTotal = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => total + s.allocatedAmount, 0)
      );
      if (allocatedTotal !== totalAmount && splitCount > 0) {
        this.adjustAllocationForRounding(splits, totalAmount, allocatedTotal);
      }
      // Patch the allocatedAmount back into the form array
      splits
        .filter((s) => s.owedBy !== '')
        .forEach((split, index) => {
          this.splitsFormArray.at(index).patchValue({
            allocatedAmount: split.allocatedAmount,
          });
        });
    } else {
      this.expenseForm.patchValue({
        sharedAmount: totalAmount - proportionalAmount,
      });
    }
  }

  private filterEmptySplits(splits: any[]): any[] {
    return splits.filter((split, i) => {
      if (!split.owedBy && +split.assignedAmount === 0) {
        this.splitsFormArray.at(i).patchValue({ allocatedAmount: 0 });
        return false;
      }
      return true;
    });
  }

  private distributeAllocations(
    splits: any[],
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
          : this.localeService.roundToCurrency(+(evenlySharedAmount / splitCount));
    });
    if (totalAmount === proportionalAmount) return;
    active.forEach((split) => {
      const base = +split.assignedAmount + +split.allocatedAmount;
      split.allocatedAmount = this.localeService.roundToCurrency(
        +(base + (base / (totalAmount - proportionalAmount)) * proportionalAmount)
      );
    });
  }

  allocateByPercentage(): void {
    if (this.splitsFormArray.length === 0) return;
    const result = this.allocationUtils.allocateByPercentage({
      totalAmount: +this.expenseForm.value.amount!,
      splits: this.splitsFormArray.getRawValue().map((s: any) => ({
        owedByMemberRef: s.owedBy,
        assignedAmount: s.assignedAmount,
        percentage: s.percentage,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });
    this.allocationUtils.applyPercentageAllocationToFormArray(this.splitsFormArray, result, 'owedBy');
  }

  allocateByShares(): void {
    if (this.splitsFormArray.length === 0) return;
    const result = this.allocationUtils.allocateByShares({
      totalAmount: +this.expenseForm.value.amount!,
      splits: this.splitsFormArray.getRawValue().map((s: any) => ({
        owedByMemberRef: s.owedBy,
        assignedAmount: s.assignedAmount,
        percentage: s.percentage,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });
    this.allocationUtils.applyPercentageAllocationToFormArray(this.splitsFormArray, result, 'owedBy');
  }

  private adjustAllocationForRounding(
    splits: any[],
    totalAmount: number,
    allocatedTotal: number
  ): void {
    let diff = this.localeService.roundToCurrency(+(totalAmount - allocatedTotal));
    const increment = this.localeService.getSmallestIncrement();
    for (let i = 0; diff !== 0; ) {
      if (diff > 0) {
        splits[i].allocatedAmount += increment;
        diff = this.localeService.roundToCurrency(+(diff - increment));
      } else {
        splits[i].allocatedAmount -= increment;
        diff = this.localeService.roundToCurrency(+(diff + increment));
      }
      i = (i + 1) % splits.length;
    }
  }

  protected effectivePercentage(index: number): number {
    const splits = this.splitsFormArray.getRawValue();
    const totalShares = splits.reduce((t: number, s: any) => t + (+s.shares || 0), 0);
    if (totalShares === 0) return 0;
    return ((+splits[index].shares || 0) / totalShares) * 100;
  }

  getAssignedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          total + this.localeService.roundToCurrency(+s.assignedAmount),
        0
      )
    );

  getAllocatedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          total + this.localeService.roundToCurrency(+s.allocatedAmount),
        0
      )
    );

  expenseFullyAllocated = (): boolean =>
    (this.expenseForm.value.amount ?? 0) === this.getAllocatedTotal();

  isLastSplit(index: number): boolean {
    return this.splitMethod() === 'percentage' && index === this.splitsFormArray.length - 1;
  }

  onSubmit(): void {
    this.submitted.set(true);
  }

  generateSummaryText(): string {
    const formValue = this.expenseForm.value;
    const totalAmount = formValue.amount || 0;
    const allocatedAmount = formValue.allocatedAmount || 0;

    let summaryText = `Total: ${this.formatCurrency(totalAmount)}\n`;

    if (this.splitMethod() === 'amount' && formValue.sharedAmount! > 0) {
      summaryText += `Evenly shared amount: ${this.formatCurrency(formValue.sharedAmount!)}\n`;
    }

    if (this.splitMethod() === 'amount' && allocatedAmount > 0) {
      summaryText += `Proportional amount (tax, tip, etc.): ${this.formatCurrency(allocatedAmount)}\n`;
    }

    // Collect all lines for alignment calculation
    const splitLines: { text: string; amount: string; isIndented: boolean }[] =
      [];

    // First pass: collect all lines and calculate max lengths
    this.splitsFormArray.controls.forEach((splitControl) => {
      const split = splitControl.value;
      if (split.owedBy?.trim()) {
        if (this.splitMethod() === 'percentage') {
          // Show percentage and total for percentage splits
          const lineText = `${split.owedBy} (${split.percentage}%)`;
          const amount = this.formatCurrency(split.allocatedAmount);
          splitLines.push({ text: lineText, amount, isIndented: false });
        } else if (this.splitMethod() === 'shares') {
          const pct = split.shares > 0 ? ` (${split.shares} shares, ${split.percentage}%)` : '';
          const lineText = `${split.owedBy}${pct}`;
          const amount = this.formatCurrency(split.allocatedAmount);
          splitLines.push({ text: lineText, amount, isIndented: false });
        } else {
          // Show breakdown for dollar amount splits
          const assignedAmount = split.assignedAmount || 0;
          const proportionalAmount = this.calculateProportionalAmount(split);
          const sharedPortionAmount = this.calculateSharedPortion();

          // Main split line
          splitLines.push({
            text: split.owedBy,
            amount: this.formatCurrency(split.allocatedAmount),
            isIndented: false,
          });

          // Breakdown lines (indented)
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

    // Calculate max line lengths for alignment
    let maxMainLineLength = 0;
    let maxIndentedLineLength = 0;

    splitLines.forEach((line) => {
      const lineLength = line.text.length + 2 + line.amount.length; // +2 for ": "
      if (line.isIndented) {
        maxIndentedLineLength = Math.max(maxIndentedLineLength, lineLength);
      } else {
        maxMainLineLength = Math.max(maxMainLineLength, lineLength);
      }
    });

    // Use the overall maximum for better alignment when we have mixed line types
    const overallMaxLength = Math.max(maxMainLineLength, maxIndentedLineLength);

    summaryText += `${'='.repeat(overallMaxLength + 1)}\n`;

    // Second pass: add properly aligned lines
    splitLines.forEach((line) => {
      const spacesNeeded =
        overallMaxLength - line.text.length - line.amount.length;
      const padding = ' '.repeat(spacesNeeded);
      summaryText += `${line.text}:${padding}${line.amount}\n`;
    });

    return summaryText.trim();
  }

  // Helper methods to calculate breakdown amounts
  protected calculateProportionalAmount(split: any): number {
    const formValue = this.expenseForm.value;
    const totalAmount = formValue.amount || 0;
    const proportionalAmount = formValue.allocatedAmount || 0;
    const baseAmount: number = totalAmount - proportionalAmount;
    const evenlySharedAmount: number =
      (formValue.sharedAmount! || 0) / (this.splitsFormArray.length || 1);

    const memberProportionalAmount: number =
      (((+split.assignedAmount || 0) + evenlySharedAmount) / baseAmount) *
      proportionalAmount;

    return this.localeService.roundToCurrency(+memberProportionalAmount);
  }

  protected calculateSharedPortion(): number {
    const formValue = this.expenseForm.value;
    const sharedAmount = formValue.sharedAmount! || 0;
    const splitCount = this.splitsFormArray.controls.filter(
      (control) => control.value.owedBy?.trim()
    ).length;

    if (splitCount === 0) return 0;
    return this.localeService.roundToCurrency(+(sharedAmount / splitCount));
  }

  // Helper method to format currency using local currency state
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

  // Method to copy summary to clipboard
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
    // Preserve the current currency selection
    const currentCurrency = this.expenseForm.get('currencyCode')!.value;
    this.expenseForm.reset({
      currencyCode: currentCurrency,
      amount: 0,
      sharedAmount: 0,
      allocatedAmount: 0,
    });
    this.splitsFormArray.clear();
    this.submitted.set(false);
    this.splitMethod.set('amount');
  }

  openCalculator(event: Event, controlName: string, index?: number): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      if (index === undefined) {
        const control = this.expenseForm.get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          this.updateTotalAmount();
        }
      } else {
        const control = this.splitsFormArray.at(index).get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          this.recalculateAllocation();
        }
      }
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'split' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    // Force start the Welcome Tour (ignoring completion state)
    this.tourService.startWelcomeTour(true);
  }

  ngOnDestroy(): void {
    // Restore the LocaleService to use the current group's currency
    const currentGroup = this.groupStore.currentGroup();
    if (currentGroup?.currencyCode) {
      this.localeService.setGroupCurrency(currentGroup.currencyCode);
    } else {
      // If no group, reset to USD
      this.localeService.setGroupCurrency('USD');
    }
  }
}
