import { inject, Injectable } from '@angular/core';
import { FormArray } from '@angular/forms';
import { LocaleService } from '@services/locale.service';

export interface AllocationInput {
  totalAmount: number;
  sharedAmount: number;
  allocatedAmount: number;
  splits: AllocationSplit[];
}

export interface AllocationSplit {
  owedByMemberRef?: any; // DocumentReference<Member> or null
  assignedAmount: number;
  percentage: number;
  shares: number;
  allocatedAmount: number;
}

export interface AllocationResult {
  splits: AllocationSplit[];
  adjustedSharedAmount: number;
}

@Injectable({
  providedIn: 'root',
})
export class AllocationUtilsService {
  protected readonly localeService = inject(LocaleService);

  allocateSharedAmounts(input: AllocationInput): AllocationResult {
    if (input.splits.length === 0) {
      return {
        splits: [],
        adjustedSharedAmount: input.totalAmount - input.allocatedAmount,
      };
    }

    // Create a copy of splits to work with
    let splits = [...input.splits];

    // Remove empty splits (no member selected and no assigned amount)
    splits = splits.filter(s => s.owedByMemberRef || s.assignedAmount !== 0);

    const splitCount = splits.filter(s => s.owedByMemberRef != null).length;

    const splitTotal: number = splits.reduce(
      (total, s) => total + (+s.assignedAmount || 0),
      0
    );

    const totalAmount: number = +input.totalAmount;
    let evenlySharedAmount: number = +input.sharedAmount;
    const proportionalAmount: number = +input.allocatedAmount;

    const totalSharedSplits: number = this.localeService.roundToCurrency(
      +(evenlySharedAmount + proportionalAmount + splitTotal)
    );

    // Adjust evenly shared amount if totals don't match
    if (totalAmount !== totalSharedSplits) {
      evenlySharedAmount = this.localeService.roundToCurrency(
        +(totalAmount - splitTotal - proportionalAmount)
      );
    }

    // First pass: Distribute evenly shared amount
    splits.forEach((split: AllocationSplit) => {
      split.allocatedAmount = this.localeService.roundToCurrency(
        +(evenlySharedAmount / splitCount)
      );
    });

    // Second pass: Add proportional allocation
    splits.forEach((split: AllocationSplit) => {
      if (totalAmount === proportionalAmount) {
        return;
      }
      const baseSplit: number = +split.assignedAmount + +split.allocatedAmount;
      split.allocatedAmount = this.localeService.roundToCurrency(
        +(
          baseSplit +
          (baseSplit / (totalAmount - proportionalAmount)) * proportionalAmount
        )
      );
    });

    // Final adjustment to handle rounding differences
    const allocatedTotal = this.localeService.roundToCurrency(
      +splits.reduce((total, s) => total + s.allocatedAmount, 0)
    );

    if (allocatedTotal !== totalAmount && splitCount > 0) {
      this.#adjustAllocationForRounding(splits, totalAmount, allocatedTotal);
    }

    return {
      splits,
      adjustedSharedAmount: evenlySharedAmount,
    };
  }

  /**
   * Allocates by percentage. Balances the last row's percentage to make the total 100,
   * then computes each member's allocatedAmount. Returns splits with updated percentage
   * and allocatedAmount values — caller is responsible for patching both back into the form.
   */
  allocateByPercentage(input: {
    totalAmount: number;
    splits: AllocationSplit[];
  }): { splits: AllocationSplit[] } {
    if (input.splits.length === 0) return { splits: [] };

    const splits = this.#filterSplitsAndSetLastPercentage([...input.splits]);
    const totalAmount = +input.totalAmount;

    splits.forEach((split: AllocationSplit) => {
      split.allocatedAmount = this.localeService.roundToCurrency(
        +((totalAmount * +split.percentage) / 100)
      );
    });

    const allocatedTotal = this.localeService.roundToCurrency(
      +splits.reduce((total, s) => total + s.allocatedAmount, 0)
    );
    const percentageTotal = this.localeService.roundToCurrency(
      +splits.reduce((total, s) => total + s.percentage, 0)
    );
    const splitCount = splits.filter(s => s.owedByMemberRef !== null).length;

    if (allocatedTotal !== totalAmount && percentageTotal === 100 && splitCount > 0) {
      this.#adjustAllocationForRounding(splits, totalAmount, allocatedTotal);
    }

    return { splits };
  }

  /**
   * Allocates by shares. Derives each member's effective percentage from their share
   * of the total shares, then delegates to allocateByPercentage. Returns splits with
   * updated percentage and allocatedAmount — caller patches both back into the form.
   */
  allocateByShares(input: {
    totalAmount: number;
    splits: AllocationSplit[];
  }): { splits: AllocationSplit[] } {
    if (input.splits.length === 0) return { splits: [] };

    const splits = [...input.splits];
    const totalShares = splits.reduce((t, s) => t + (+s.shares || 0), 0);

    if (totalShares === 0) {
      splits.forEach(s => {
        s.percentage = 0;
        s.allocatedAmount = 0;
      });
      return { splits };
    }

    splits.forEach(s => {
      s.percentage = this.localeService.roundToCurrency(
        ((+s.shares || 0) / totalShares) * 100
      );
    });

    // Ensure percentages sum to exactly 100 by adjusting the last row
    const percentageSum = this.localeService.roundToCurrency(
      splits.reduce((t, s) => t + s.percentage, 0)
    );
    if (percentageSum !== 100 && splits.length > 0) {
      splits.at(-1)!.percentage = this.localeService.roundToCurrency(
        splits.at(-1)!.percentage + (100 - percentageSum)
      );
    }

    return this.allocateByPercentage({ totalAmount: input.totalAmount, splits });
  }

  /** Patches both `percentage` and `allocatedAmount` back into the form after percentage or shares allocation. */
  applyPercentageAllocationToFormArray(
    formArray: FormArray,
    result: { splits: AllocationSplit[] },
    memberRefFieldName: string = 'owedByMemberRef'
  ): void {
    const formControlMap = new Map<string, number>();
    for (let i = 0; i < formArray.length; i++) {
      const memberRef = formArray.at(i).get(memberRefFieldName)?.value;
      if (memberRef) {
        const key = memberRef.id || memberRef.toString() || memberRef;
        formControlMap.set(key, i);
      }
    }
    result.splits.forEach(split => {
      const memberRef = split.owedByMemberRef;
      if (memberRef) {
        const key = memberRef.id || memberRef.toString() || memberRef;
        const idx = formControlMap.get(key);
        if (idx !== undefined) {
          formArray.at(idx).patchValue(
            { percentage: split.percentage, allocatedAmount: split.allocatedAmount },
            { emitEvent: false }
          );
        }
      }
    });
  }

  applyAllocationToFormArray(
    formArray: FormArray,
    allocationResult: AllocationResult,
    memberRefFieldName: 'owedByMemberRef' = 'owedByMemberRef'
  ): void {
    // Create a map of existing form controls by member reference for faster lookup
    const formControlMap = new Map();
    for (let i = 0; i < formArray.length; i++) {
      const control = formArray.at(i);
      const memberRef = control.get(memberRefFieldName)?.value;
      if (memberRef) {
        const key = memberRef.id || memberRef.toString() || memberRef;
        formControlMap.set(key, i);
      }
    }

    // Apply the allocated amounts to the corresponding form controls
    allocationResult.splits.forEach((split) => {
      const memberRef = split.owedByMemberRef;
      if (memberRef) {
        const key = memberRef.id || memberRef.toString() || memberRef;
        if (formControlMap.has(key)) {
          const formIndex = formControlMap.get(key)!;
          formArray.at(formIndex).patchValue({
            allocatedAmount: split.allocatedAmount,
          });
        }
      }
    });
  }

  #filterSplitsAndSetLastPercentage(splits: AllocationSplit[]): AllocationSplit[] {
    let totalPercentage = 0;
    const result = splits.filter(s => s.owedByMemberRef || s.assignedAmount !== 0);
    for (let i = 0; i < result.length - 1; i++) {
      result[i]!.percentage = +result[i]!.percentage;
      totalPercentage += result[i]!.percentage;
    }
    if (result.length > 0) {
      const lastIndex = result.length - 1;
      result[lastIndex]!.percentage = this.localeService.roundToCurrency(
        +(100 - totalPercentage)
      );
    }
    return result;
  }

  #adjustAllocationForRounding(
    splits: AllocationSplit[],
    totalAmount: number,
    allocatedTotal: number
  ): void {
    let diff = this.localeService.roundToCurrency(+(totalAmount - allocatedTotal));
    const increment = this.localeService.getSmallestIncrement();
    let i = 0;
    while (diff != 0) {
      if (diff > 0) {
        splits[i]!.allocatedAmount += increment;
        diff = this.localeService.roundToCurrency(+(diff - increment));
      } else {
        splits[i]!.allocatedAmount -= increment;
        diff = this.localeService.roundToCurrency(+(diff + increment));
      }
      i = (i + 1) % splits.length;
    }
  }
}
