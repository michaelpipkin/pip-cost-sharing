import { CurrencyPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  ElementRef,
  inject,
  model,
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Split } from '@models/split';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';

@Component({
  selector: 'app-split',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatOptionModule,
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
export class SplitComponent {
  protected readonly fb = inject(FormBuilder);
  protected readonly snackBar = inject(MatSnackBar);

  submitted = signal<boolean>(false);

  splitByPercentage = model<boolean>(false);

  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');
  memberPercentages = viewChildren<ElementRef>('memberPercentage');

  expenseForm = this.fb.group({
    amount: [0, [Validators.required, this.amountValidator()]],
    sharedAmount: [0.0, Validators.required],
    allocatedAmount: [0, Validators.required],
    splits: this.fb.array([], [Validators.required, Validators.minLength(1)]),
  });

  constructor() {
    afterNextRender(() => {
      this.totalAmountField().nativeElement.value = '0.00';
      this.allocatedAmountField().nativeElement.value = '0.00';
      this.memberAmounts().forEach((elementRef: ElementRef) => {
        elementRef.nativeElement.value = '0.00';
      });
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
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
      assignedAmount: ['0.00', Validators.required],
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
        lastInput.nativeElement.value = '0.00';
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

  toggleSplitByPercentage(): void {
    this.splitByPercentage.set(!this.splitByPercentage());
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  updateTotalAmount(): void {
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  allocateSharedAmounts(): void {
    if (this.splitsFormArray.length > 0) {
      let splits = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedBy && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          i++;
        }
      }
      const splitCount: number = splits.filter((s) => s.owedBy !== '').length;
      const splitTotal: number = this.getAssignedTotal();
      const val = this.expenseForm.value;
      const totalAmount: number = val.amount;
      let sharedAmount: number = val.sharedAmount;
      const allocatedAmount: number = val.allocatedAmount;
      const totalSharedSplits: number = +(
        sharedAmount +
        allocatedAmount +
        splitTotal
      ).toFixed(2);
      if (totalAmount != totalSharedSplits) {
        sharedAmount = +(totalAmount - splitTotal - allocatedAmount).toFixed(2);
        this.expenseForm.patchValue({
          sharedAmount: sharedAmount,
        });
      }
      // First, split the shared amount equally among all splits
      splits.forEach((split: Split) => {
        split.allocatedAmount = +(sharedAmount / splitCount).toFixed(2);
      });
      splits.forEach((split: Split) => {
        if (splitTotal == 0) {
          split.allocatedAmount += +(allocatedAmount / splitCount).toFixed(2);
        } else {
          split.allocatedAmount = +(
            +split.assignedAmount +
            +split.allocatedAmount +
            (+split.assignedAmount / splitTotal) * allocatedAmount
          ).toFixed(2);
        }
      });
      const allocatedTotal = +splits
        .reduce((total, s) => (total += s.allocatedAmount), 0)
        .toFixed(2);
      if (allocatedTotal !== totalAmount && splitCount > 0) {
        let diff = +(totalAmount - allocatedTotal).toFixed(2);
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += 0.01;
            diff = +(diff - 0.01).toFixed(2);
          } else {
            splits[i].allocatedAmount -= 0.01;
            diff = +(diff + 0.01).toFixed(2);
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

  allocateByPercentage(): void {
    var totalPercentage: number = 0;
    if (this.splitsFormArray.length > 0) {
      let splits = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedBy && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          if (i < splits.length - 1) {
            splits[i].percentage = +splits[i].percentage;
            totalPercentage += splits[i].percentage;
          } else {
            const remainingPercentage: number = +(
              100 - totalPercentage
            ).toFixed(2);
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
      const totalAmount: number = val.amount;
      splits.forEach((split: Split) => {
        split.allocatedAmount = +(
          (totalAmount * +split.percentage) /
          100
        ).toFixed(2);
      });
      const allocatedTotal: number = +splits
        .reduce((total, s) => (total += s.allocatedAmount), 0)
        .toFixed(2);
      const percentageTotal: number = +splits
        .reduce((total, s) => (total += s.percentage), 0)
        .toFixed(2);
      if (
        allocatedTotal !== totalAmount &&
        percentageTotal === 100 &&
        splitCount > 0
      ) {
        let diff = +(totalAmount - allocatedTotal).toFixed(2);
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += 0.01;
            diff = +(diff - 0.01).toFixed(2);
          } else {
            splits[i].allocatedAmount -= 0.01;
            diff = +(diff + 0.01).toFixed(2);
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
    +[...this.splitsFormArray.value]
      .reduce((total, s) => (total += +s.assignedAmount), 0)
      .toFixed(2);

  getAllocatedTotal = (): number =>
    +[...this.splitsFormArray.value]
      .reduce((total, s) => (total += +s.allocatedAmount), 0)
      .toFixed(2);

  expenseFullyAllocated = (): boolean =>
    this.expenseForm.value.amount == this.getAllocatedTotal();

  onSubmit(): void {
    this.submitted.set(true);
  }

  generateSummaryText(): string {
    const formValue = this.expenseForm.value;
    const totalAmount = formValue.amount || 0;
    const allocatedAmount = formValue.allocatedAmount || 0;

    let summaryText = `Total: ${this.formatCurrency(totalAmount)}\n`;

    if (!this.splitByPercentage() && formValue.sharedAmount > 0) {
      summaryText += `Evenl shared amount: ${this.formatCurrency(formValue.sharedAmount)}\n`;
    }

    if (!this.splitByPercentage() && allocatedAmount > 0) {
      summaryText += `Proportional amount (tax, tip, etc.): ${this.formatCurrency(allocatedAmount)}\n`;
    }

    summaryText += '=============\n';

    // Add each person's allocation with breakdown
    this.splitsFormArray.controls.forEach((splitControl) => {
      const split = splitControl.value;
      if (split.owedBy && split.owedBy.trim()) {
        if (this.splitByPercentage()) {
          // Show percentage and total for percentage splits
          summaryText += `${split.owedBy} (${split.percentage}%): ${this.formatCurrency(split.allocatedAmount)}\n`;
        } else {
          // Show breakdown for dollar amount splits
          const assignedAmount = split.assignedAmount || 0;
          const proportionalAmount = this.calculateProportionalAmount(split);
          const sharedPortionAmount = this.calculateSharedPortion();

          summaryText += `${split.owedBy}: ${this.formatCurrency(split.allocatedAmount)}\n`;
          if (assignedAmount > 0) {
            summaryText += `  Personal: ${this.formatCurrency(assignedAmount)}\n`;
          }
          if (sharedPortionAmount > 0) {
            summaryText += `  Shared: ${this.formatCurrency(sharedPortionAmount)}\n`;
          }
          if (proportionalAmount > 0) {
            summaryText += `  Proportional: ${this.formatCurrency(proportionalAmount)}\n`;
          }
        }
      }
    });

    return summaryText.trim();
  }

  // Helper methods to calculate breakdown amounts
  private calculateProportionalAmount(split: any): number {
    const formValue = this.expenseForm.value;
    const allocatedAmount = formValue.allocatedAmount || 0;
    const splitTotal = this.getAssignedTotal();
    const assignedAmount = split.assignedAmount || 0;

    if (splitTotal === 0 || allocatedAmount === 0) return 0;
    return +((assignedAmount / splitTotal) * allocatedAmount).toFixed(2);
  }

  private calculateSharedPortion(): number {
    const formValue = this.expenseForm.value;
    const sharedAmount = formValue.sharedAmount || 0;
    const splitCount = this.splitsFormArray.controls.filter(
      (control) => control.value.owedBy && control.value.owedBy.trim()
    ).length;

    if (splitCount === 0) return 0;
    return +(sharedAmount / splitCount).toFixed(2);
  }

  // Helper method to format currency
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  // Method to copy summary to clipboard
  copySummaryToClipboard(): void {
    const summaryText = this.generateSummaryText();
    navigator.clipboard
      .writeText(summaryText)
      .then(() => {
        this.snackBar.open('Summary copied to clipboard', 'OK', {
          duration: 2000,
        });
      })
      .catch(() => {
        this.snackBar.open('Failed to copy summary', 'OK', {
          duration: 2000,
        });
      });
  }

  resetForm(): void {
    this.expenseForm.reset({
      amount: 0,
      sharedAmount: 0,
      allocatedAmount: 0,
    });
    this.splitsFormArray.clear();
    this.submitted.set(false);
    this.splitByPercentage.set(false);
  }
}
