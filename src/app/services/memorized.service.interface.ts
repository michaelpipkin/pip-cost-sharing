import { Memorized } from '@models/memorized';
import { DocumentReference } from 'firebase/firestore';

export interface IMemorizedService {
  getMemorizedExpensesForGroup(groupId: string): void;
  getMemorized(groupId: string, memorizedId: string): Promise<Memorized>;
  addMemorized(groupId: string, memorized: Partial<Memorized>): Promise<any>;
  updateMemorized(
    memorizedRef: DocumentReference<Memorized>,
    changes: Partial<Memorized>
  ): Promise<any>;
  deleteMemorized(memorizedRef: DocumentReference<Memorized>): Promise<any>;
}
