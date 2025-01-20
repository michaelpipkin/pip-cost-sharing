import { Memorized } from '@models/memorized';

export interface IMemorizedService {
  getMemorizedExpensesForGroup(groupId: string): void;
  getMemorized(groupId: string, memorizedId: string): Promise<Memorized>;
  addMemorized(groupId: string, memorized: Partial<Memorized>): Promise<any>;
  updateMemorized(
    groupId: string,
    memorizedId: string,
    changes: Partial<Memorized>
  ): Promise<any>;
  deleteMemorized(groupId: string, memorizedId: string): Promise<any>;
}
