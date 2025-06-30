import { History } from '@models/history';
import { Split } from '@models/split';

export interface ISplitService {
  getUnpaidSplitsForGroup(groupId: string): void;
  updateSplit(
    groupId: string,
    expenseId: string,
    splitId: string,
    changes: Partial<Split>
  ): Promise<any>;
  paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    history: Partial<History>
  ): Promise<any>;
}
