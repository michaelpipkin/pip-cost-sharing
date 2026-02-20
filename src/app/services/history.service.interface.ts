import { History } from '@models/history';
import { Split } from '@models/split';
import { DocumentReference } from 'firebase/firestore';
import { Expense } from '@models/expense';

export interface IHistoryService {
  getHistoryForGroup(groupId: string): void;
  unpayHistory(groupId: string, history: History): Promise<void>;
  unpaySingleSplitFromHistory(
    groupId: string,
    splitRef: DocumentReference<Split>,
    expenseRef: DocumentReference<Expense>,
    history: History,
    splitAllocatedAmount: number,
    isPositiveDirection: boolean
  ): Promise<void>;
}
