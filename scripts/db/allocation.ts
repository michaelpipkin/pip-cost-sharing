/**
 * Pure allocation helpers ported from the app's AllocationUtilsService
 * (src/app/utilities/allocation-utils.service.ts). Side-effect free: no
 * firebase-admin import, so any seed script can use these without initializing
 * the Admin SDK.
 */

/**
 * Direct port of LocaleService.roundToCurrency / getSmallestIncrement
 * (src/app/services/locale.service.ts), driven by a group's own
 * decimalPlaces field instead of Angular DI.
 */
export interface Rounder {
  round: (value: number) => number;
  increment: number;
}

export function makeRounder(decimalPlaces: number): Rounder {
  const multiplier = Math.pow(10, decimalPlaces);
  return {
    round: (value: number): number => {
      if (Number.isNaN(value)) return 0;
      return Math.round(value * multiplier) / multiplier;
    },
    increment: decimalPlaces === 0 ? 1 : 1 / multiplier,
  };
}

export interface AllocationSplit {
  owedByMemberRef?: unknown;
  assignedAmount: number;
  percentage: number;
  shares: number;
  allocatedAmount: number;
}

export interface AllocationInput {
  totalAmount: number;
  sharedAmount: number;
  allocatedAmount: number;
  splits: AllocationSplit[];
}

/**
 * Faithful port of AllocationUtilsService.allocateSharedAmounts
 * (src/app/utilities/allocation-utils.service.ts) — ported rather than
 * imported because the original is an Angular @Injectable with LocaleService
 * DI. The math must match exactly or seeded splits won't reconcile the way
 * the app's own screens expect.
 */
export function allocateSharedAmounts(
  input: AllocationInput,
  rounder: Rounder
): { splits: AllocationSplit[]; adjustedSharedAmount: number } {
  const { round } = rounder;
  if (input.splits.length === 0) {
    return {
      splits: [],
      adjustedSharedAmount: input.totalAmount - input.allocatedAmount,
    };
  }

  let splits = [...input.splits];
  splits = splits.filter((s) => s.owedByMemberRef || s.assignedAmount !== 0);
  const splitCount = splits.filter((s) => s.owedByMemberRef != null).length;

  const splitTotal = splits.reduce((total, s) => total + (+s.assignedAmount || 0), 0);
  const totalAmount = +input.totalAmount;
  let evenlySharedAmount = +input.sharedAmount;
  const proportionalAmount = +input.allocatedAmount;

  const totalSharedSplits = round(+(evenlySharedAmount + proportionalAmount + splitTotal));

  if (totalAmount !== totalSharedSplits) {
    evenlySharedAmount = round(+(totalAmount - splitTotal - proportionalAmount));
  }

  splits.forEach((split) => {
    split.allocatedAmount = round(+(evenlySharedAmount / splitCount));
  });

  splits.forEach((split) => {
    if (totalAmount === proportionalAmount) return;
    const baseSplit = +split.assignedAmount + +split.allocatedAmount;
    split.allocatedAmount = round(
      +(baseSplit + (baseSplit / (totalAmount - proportionalAmount)) * proportionalAmount)
    );
  });

  const allocatedTotal = round(+splits.reduce((total, s) => total + s.allocatedAmount, 0));

  if (allocatedTotal !== totalAmount && splitCount > 0) {
    adjustAllocationForRounding(splits, totalAmount, allocatedTotal, rounder);
  }

  return { splits, adjustedSharedAmount: evenlySharedAmount };
}

/** Faithful port of AllocationUtilsService.allocateByPercentage. */
export function allocateByPercentage(
  input: { totalAmount: number; splits: AllocationSplit[] },
  rounder: Rounder
): { splits: AllocationSplit[] } {
  if (input.splits.length === 0) return { splits: [] };
  const { round } = rounder;

  const splits = filterSplitsAndSetLastPercentage([...input.splits], round);
  const totalAmount = +input.totalAmount;

  splits.forEach((split) => {
    split.allocatedAmount = round(+((totalAmount * +split.percentage) / 100));
  });

  const allocatedTotal = round(+splits.reduce((total, s) => total + s.allocatedAmount, 0));
  const percentageTotal = round(+splits.reduce((total, s) => total + s.percentage, 0));
  const splitCount = splits.filter((s) => s.owedByMemberRef != null).length;

  if (allocatedTotal !== totalAmount && percentageTotal === 100 && splitCount > 0) {
    adjustAllocationForRounding(splits, totalAmount, allocatedTotal, rounder);
  }

  return { splits };
}

/** Faithful port of AllocationUtilsService.allocateByShares. */
export function allocateByShares(
  input: { totalAmount: number; splits: AllocationSplit[] },
  rounder: Rounder
): { splits: AllocationSplit[] } {
  if (input.splits.length === 0) return { splits: [] };
  const { round } = rounder;

  const splits = input.splits.filter((s) => s.owedByMemberRef || s.assignedAmount !== 0);
  const totalShares = splits.reduce((t, s) => t + (+s.shares || 0), 0);

  if (totalShares === 0 || splits.length === 0) {
    splits.forEach((s) => {
      s.percentage = 0;
      s.allocatedAmount = 0;
    });
    return { splits };
  }

  const totalAmount = +input.totalAmount;

  splits.forEach((s) => {
    const shareRatio = (+s.shares || 0) / totalShares;
    s.percentage = round(shareRatio * 100);
    s.allocatedAmount = round(shareRatio * totalAmount);
  });

  const allocatedTotal = round(splits.reduce((total, s) => total + s.allocatedAmount, 0));

  if (allocatedTotal !== totalAmount) {
    adjustAllocationForRounding(splits, totalAmount, allocatedTotal, rounder);
  }

  return { splits };
}

function filterSplitsAndSetLastPercentage(
  splits: AllocationSplit[],
  round: (value: number) => number
): AllocationSplit[] {
  let totalPercentage = 0;
  const result = splits.filter((s) => s.owedByMemberRef || s.assignedAmount !== 0);
  for (let i = 0; i < result.length - 1; i++) {
    result[i]!.percentage = +result[i]!.percentage;
    totalPercentage += result[i]!.percentage;
  }
  if (result.length > 0) {
    const lastIndex = result.length - 1;
    result[lastIndex]!.percentage = round(+(100 - totalPercentage));
  }
  return result;
}

/** Faithful port of AllocationUtilsService.#adjustAllocationForRounding. */
function adjustAllocationForRounding(
  splits: AllocationSplit[],
  totalAmount: number,
  allocatedTotal: number,
  rounder: Rounder
): void {
  const { round, increment } = rounder;
  let diff = round(+(totalAmount - allocatedTotal));
  let i = 0;
  while (diff !== 0) {
    if (diff > 0) {
      splits[i]!.allocatedAmount += increment;
      diff = round(+(diff - increment));
    } else {
      splits[i]!.allocatedAmount -= increment;
      diff = round(+(diff + increment));
    }
    i = (i + 1) % splits.length;
  }
}
