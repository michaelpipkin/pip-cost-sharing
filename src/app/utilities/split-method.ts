export type SplitMethod = 'amount' | 'percentage' | 'shares';

export function normalizeSplitMethod(data: {
  splitMethod?: SplitMethod;
  splitByPercentage?: boolean;
}): SplitMethod {
  if (data.splitMethod) return data.splitMethod;
  return data.splitByPercentage ? 'percentage' : 'amount';
}
