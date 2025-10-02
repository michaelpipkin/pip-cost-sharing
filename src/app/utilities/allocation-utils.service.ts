import { Injectable } from '@angular/core';
import { FormArray } from '@angular/forms';

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
  /**
   * Allocates shared amounts across splits using the same logic as the individual components
   * @param input The allocation input data
   * @returns The calculated allocation result
   */
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
    for (let i = 0; i < splits.length; ) {
      const memberRef = splits[i].owedByMemberRef;
      if (!memberRef && splits[i].assignedAmount === 0) {
        splits.splice(i, 1);
      } else {
        i++;
      }
    }

    const splitCount: number = splits.filter((s) => {
      const memberRef = s.owedByMemberRef;
      return memberRef !== null && memberRef !== undefined;
    }).length;

    const splitTotal: number = splits.reduce(
      (total, s) => total + (+s.assignedAmount || 0),
      0
    );

    const totalAmount: number = +input.totalAmount;
    let evenlySharedAmount: number = +input.sharedAmount;
    const proportionalAmount: number = +input.allocatedAmount;

    const totalSharedSplits: number = +(
      evenlySharedAmount +
      proportionalAmount +
      splitTotal
    ).toFixed(2);

    // Adjust evenly shared amount if totals don't match
    if (totalAmount != totalSharedSplits) {
      evenlySharedAmount = +(
        totalAmount -
        splitTotal -
        proportionalAmount
      ).toFixed(2);
    }

    // First pass: Distribute evenly shared amount
    splits.forEach((split: AllocationSplit) => {
      split.allocatedAmount = +(evenlySharedAmount / splitCount).toFixed(2);
    });

    // Second pass: Add proportional allocation
    splits.forEach((split: AllocationSplit) => {
      if (totalAmount === proportionalAmount) {
        return;
      }
      const baseSplit: number = +split.assignedAmount + +split.allocatedAmount;
      split.allocatedAmount = +(
        baseSplit +
        (baseSplit / (totalAmount - proportionalAmount)) * proportionalAmount
      ).toFixed(2);
    });

    // Final adjustment to handle rounding differences
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

    return {
      splits,
      adjustedSharedAmount: evenlySharedAmount,
    };
  }

  /**
   * Helper method to apply allocation results back to a FormArray
   * @param formArray The FormArray to update
   * @param allocationResult The result from allocateSharedAmounts
   * @param memberRefFieldName The field name for member reference (should always be 'owedByMemberRef')
   */
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
        // Use a string identifier that works for both DocumentReference objects and simple values
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
          const formIndex = formControlMap.get(key);
          formArray.at(formIndex).patchValue({
            allocatedAmount: split.allocatedAmount,
          });
        }
      }
    });
  }
}
