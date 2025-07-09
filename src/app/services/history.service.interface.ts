import { History } from '@models/history';
import { DocumentReference } from 'firebase/firestore';

export interface IHistoryService {
  getHistoryForGroup(groupId: string): void;
  deleteHistory(historyRef: DocumentReference<History>): Promise<void>;
}
