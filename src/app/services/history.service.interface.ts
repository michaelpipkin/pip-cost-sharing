import { Expense } from '@models/expense';
import { History } from '@models/history';
import { Split } from '@models/split';
import { DocumentReference } from 'firebase/firestore';

export interface IHistoryService {
  getHistoryForGroup(groupId: string): void;
  unpayHistory(history: History): Promise<void>;
  unpaySingleSplitFromHistory(
    splitRef: DocumentReference<Split>,
    expenseRef: DocumentReference<Expense>,
    history: History,
    splitAllocatedAmount: number,
    isPositiveDirection: boolean
  ): Promise<void>;
}
