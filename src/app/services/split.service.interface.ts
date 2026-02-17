import { Expense } from '@models/expense';
import { HistoryDto } from '@models/history';
import { Split, SplitDto } from '@models/split';
import { AmountDue } from '@models/amount-due';
import { DocumentReference } from 'firebase/firestore';

export interface ISplitService {
  getUnpaidSplitsForGroup(groupId: string): void;
  updateSplit(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    splitRef: DocumentReference<Split>,
    changes: Partial<SplitDto>
  ): Promise<any>;
  paySplitsBetweenMembers(
    groupId: string,
    splits: Split[],
    history: Partial<HistoryDto>
  ): Promise<any>;
  settleGroup(
    groupId: string,
    splits: Split[],
    transfers: AmountDue[]
  ): Promise<any>;
}
