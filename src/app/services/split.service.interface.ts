import { Expense } from '@models/expense';
import { History } from '@models/history';
import { Split } from '@models/split';
import { DocumentReference } from 'firebase/firestore';

export interface ISplitService {
  getUnpaidSplitsForGroup(groupId: string): void;
  updateSplit(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    splitRef: DocumentReference<Split>,
    changes: Partial<Split>
  ): Promise<any>;
  paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    history: Partial<History>
  ): Promise<any>;
}
