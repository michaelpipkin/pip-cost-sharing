import {
  afterEveryRender,
  afterNextRender,
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  model,
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
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import {
  getCurrencyConfig,
  SUPPORTED_CURRENCIES,
} from '@models/currency-config.interface';
import { Split } from '@models/split';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { TourService } from '@services/tour.service';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CalculatorOverlayService } from '@shared/services/calculator-overlay.service';
import { AnalyticsService } from '@services/analytics.service';
import { GroupStore } from '@store/group.store';

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
    FormatCurrencyInputDirective,
    RouterLink,
  ],
  templateUrl: './split.component.html',
  styleUrl: './split.component.scss',
})
export class SplitComponent implements AfterViewInit, OnDestroy {
  protected readonly fb = inject(FormBuilder);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  private readonly analytics = inject(AnalyticsService);
  protected readonly demoService = inject(DemoService);
  protected readonly tourService = inject(TourService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);
  protected readonly groupStore = inject(GroupStore);

  supportedCurrencies = SUPPORTED_CURRENCIES;
  submitted = signal<boolean>(false);

  splitByPercentage = model<boolean>(false);

  // Local currency state for split component (not tied to group)
  private localCurrencyCode = signal<string>('USD');

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

      this.totalAmountField().nativeElement.value =
        this.localeService.getFormattedZero();
      this.allocatedAmountField().nativeElement.value =
        this.localeService.getFormattedZero();
      this.memberAmounts().forEach((elementRef: ElementRef) => {
        elementRef.nativeElement.value = this.localeService.getFormattedZero();
      });
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
  }

  ngAfterViewInit(): void {
    // Pre-populate demo data if in demo mode
    if (this.demoService.isInDemoMode()) {
      this.populateDemoData();
      // Start Welcome Tour after populating data
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => {
        this.tourService.startWelcomeTour();
      }, 500);
    }
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
      this.totalAmountField().nativeElement.value =
        this.localeService.roundToCurrency(65.33);
      this.allocatedAmountField().nativeElement.value =
        this.localeService.roundToCurrency(17.44);

      const memberAmountElements = this.memberAmounts();
      if (memberAmountElements.length >= 3) {
        memberAmountElements[0].nativeElement.value =
          this.localeService.roundToCurrency(12.55);
        memberAmountElements[1].nativeElement.value =
          this.localeService.roundToCurrency(13.37);
        memberAmountElements[2].nativeElement.value =
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
      percentage: [0.0],
      allocatedAmount: [0.0],
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
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  onSplitByPercentageClick(): void {
    this.splitByPercentage.set(true);
    this.expenseForm.markAsDirty();
    this.allocateByPercentage();
  }

  onSplitByAmountClick(): void {
    this.splitByPercentage.set(false);
    this.expenseForm.markAsDirty();
    this.allocateSharedAmounts();
  }

  updateTotalAmount(): void {
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  onCurrencyChange(): void {
    const currencyCode = this.expenseForm.get('currencyCode').value;
    // Update local state for display
    this.localCurrencyCode.set(currencyCode);
    // Update LocaleService so directives use correct currency
    this.localeService.setGroupCurrency(currencyCode);
    this.resetForm();
  }

  allocateSharedAmounts(): void {
    const val = this.expenseForm.value;
    const totalAmount: number = +val.amount;
    const proportionalAmount: number = +val.allocatedAmount;
    if (this.splitsFormArray.length > 0) {
      let splits = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedBy && +splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
          this.splitsFormArray.at(i).patchValue({
            allocatedAmount: 0,
          });
        } else {
          i++;
        }
      }
      const splitCount: number = splits.filter((s) => s.owedBy !== '').length;
      const splitTotal: number = this.getAssignedTotal();
      let evenlySharedAmount: number = +val.sharedAmount;
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
      splits
        .filter((s) => s.owedBy !== '')
        .forEach((split: Split) => {
          split.allocatedAmount =
            splitCount === 0
              ? 0
              : this.localeService.roundToCurrency(
                  +(evenlySharedAmount / splitCount)
                );
        });
      splits
        .filter((s) => s.owedBy !== '')
        .forEach((split: Split) => {
          if (totalAmount === proportionalAmount) {
            return;
          }
          const baseSplit: number =
            +split.assignedAmount + +split.allocatedAmount;
          split.allocatedAmount = this.localeService.roundToCurrency(
            +(
              baseSplit +
              (baseSplit / (totalAmount - proportionalAmount)) *
                proportionalAmount
            )
          );
        });
      const allocatedTotal = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => (total += s.allocatedAmount), 0)
      );
      if (allocatedTotal !== totalAmount && splitCount > 0) {
        let diff = this.localeService.roundToCurrency(
          +(totalAmount - allocatedTotal)
        );
        const increment = this.localeService.getSmallestIncrement();
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += increment;
            diff = this.localeService.roundToCurrency(+(diff - increment));
          } else {
            splits[i].allocatedAmount -= increment;
            diff = this.localeService.roundToCurrency(+(diff + increment));
          }
          if (i < splits.length - 1) {
            i++;
          } else {
            i = 0;
          }
        }
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

  allocateByPercentage(): void {
    var totalPercentage: number = 0;
    if (this.splitsFormArray.length > 0) {
      let splits = [...this.splitsFormArray.getRawValue()];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedBy && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          if (i < splits.length - 1) {
            splits[i].percentage = +splits[i].percentage;
            totalPercentage += splits[i].percentage;
          } else {
            const remainingPercentage: number =
              this.localeService.roundToCurrency(+(100 - totalPercentage));
            splits[i].percentage = remainingPercentage;
            this.splitsFormArray.at(i).patchValue({
              percentage: remainingPercentage,
            });
          }
          i++;
        }
      }
      const splitCount: number = splits.filter((s) => s.owedBy !== '').length;
      const val = this.expenseForm.value;
      const totalAmount: number = +val.amount;
      splits.forEach((split: Split) => {
        split.allocatedAmount = this.localeService.roundToCurrency(
          +((totalAmount * +split.percentage) / 100)
        );
      });
      const allocatedTotal: number = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => (total += s.allocatedAmount), 0)
      );
      const percentageTotal: number = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => (total += s.percentage), 0)
      );
      if (
        allocatedTotal !== totalAmount &&
        percentageTotal === 100 &&
        splitCount > 0
      ) {
        let diff = this.localeService.roundToCurrency(
          +(totalAmount - allocatedTotal)
        );
        const increment = this.localeService.getSmallestIncrement();
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += increment;
            diff = this.localeService.roundToCurrency(+(diff - increment));
          } else {
            splits[i].allocatedAmount -= increment;
            diff = this.localeService.roundToCurrency(+(diff + increment));
          }
          if (i < splits.length - 1) {
            i++;
          } else {
            i = 0;
          }
        }
      }
      // Patch the allocatedAmount back into the form array
      splits.forEach((split, index) => {
        this.splitsFormArray.at(index).patchValue({
          allocatedAmount: split.allocatedAmount,
        });
      });
    }
  }

  getAssignedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          (total += this.localeService.roundToCurrency(+s.assignedAmount)),
        0
      )
    );

  getAllocatedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          (total += this.localeService.roundToCurrency(+s.allocatedAmount)),
        0
      )
    );

  expenseFullyAllocated = (): boolean =>
    this.expenseForm.value.amount == this.getAllocatedTotal();

  isLastSplit(index: number): boolean {
    return index === this.splitsFormArray.length - 1;
  }

  onSubmit(): void {
    this.submitted.set(true);
  }

  generateSummaryText(): string {
    const formValue = this.expenseForm.value;
    const totalAmount = formValue.amount || 0;
    const allocatedAmount = formValue.allocatedAmount || 0;

    let summaryText = `Total: ${this.formatCurrency(totalAmount)}\n`;

    if (!this.splitByPercentage() && formValue.sharedAmount > 0) {
      summaryText += `Evenly shared amount: ${this.formatCurrency(formValue.sharedAmount)}\n`;
    }

    if (!this.splitByPercentage() && allocatedAmount > 0) {
      summaryText += `Proportional amount (tax, tip, etc.): ${this.formatCurrency(allocatedAmount)}\n`;
    }

    // Collect all lines for alignment calculation
    const splitLines: { text: string; amount: string; isIndented: boolean }[] =
      [];

    // First pass: collect all lines and calculate max lengths
    this.splitsFormArray.controls.forEach((splitControl) => {
      const split = splitControl.value;
      if (split.owedBy && split.owedBy.trim()) {
        if (this.splitByPercentage()) {
          // Show percentage and total for percentage splits
          const lineText = `${split.owedBy} (${split.percentage}%)`;
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
  private calculateProportionalAmount(split: any): number {
    const formValue = this.expenseForm.value;
    const totalAmount = formValue.amount || 0;
    const proportionalAmount = formValue.allocatedAmount || 0;
    const baseAmount: number = totalAmount - proportionalAmount;
    const evenlySharedAmount: number =
      (formValue.sharedAmount || 0) / (this.splitsFormArray.length || 1);

    const memberProportionalAmount: number =
      (((+split.assignedAmount || 0) + evenlySharedAmount) / baseAmount) *
      proportionalAmount;

    return this.localeService.roundToCurrency(+memberProportionalAmount);
  }

  private calculateSharedPortion(): number {
    const formValue = this.expenseForm.value;
    const sharedAmount = formValue.sharedAmount || 0;
    const splitCount = this.splitsFormArray.controls.filter(
      (control) => control.value.owedBy && control.value.owedBy.trim()
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
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'copy_expense_summary_to_clipboard',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Failed to copy summary' },
        });
      }
    }
  }

  resetForm(): void {
    // Preserve the current currency selection
    const currentCurrency = this.expenseForm.get('currencyCode').value;
    this.expenseForm.reset({
      currencyCode: currentCurrency,
      amount: 0,
      sharedAmount: 0,
      allocatedAmount: 0,
    });
    this.splitsFormArray.clear();
    this.submitted.set(false);
    this.splitByPercentage.set(false);
  }

  openCalculator(event: Event, controlName: string, index?: number): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      if (index !== undefined) {
        const control = this.splitsFormArray.at(index).get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          if (this.splitByPercentage()) {
            this.allocateByPercentage();
          } else {
            this.allocateSharedAmounts();
          }
        }
      } else {
        const control = this.expenseForm.get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          this.updateTotalAmount();
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
